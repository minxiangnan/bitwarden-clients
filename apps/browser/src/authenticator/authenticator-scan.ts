import jsQR from "jsqr";

import { BrowserApi } from "../platform/browser/browser-api";

type QrDetector = new (options: { formats: string[] }) => {
  detect: (source: CanvasImageSource) => Promise<Array<{ rawValue?: string }>>;
};

export type ScanTabCandidate = {
  id?: number;
  windowId?: number;
  active?: boolean;
  lastAccessed?: number;
  url?: string;
};

const SCAN_TIMEOUT_MS = 8000;
const MAX_DECODE_EDGE = 960;

/**
 * A page the scan can read. Extension pages and browser UI are not websites.
 */
export function isScannableWebUrl(url: string | undefined): boolean {
  if (url == null || url === "") {
    return false;
  }
  return url.startsWith("http://") || url.startsWith("https://") || url.startsWith("file://");
}

/**
 * Picks the website the user was looking at.
 *
 * The toolbar popup is not a tab, so the active website tab is the right one.
 * A popped-out extension page is a tab in its own window or in the same window,
 * and that tab must be skipped or the scan reads the extension instead of the site.
 */
export function pickScanTab(
  tabs: ScanTabCandidate[],
  ownTabId: number | null,
): ScanTabCandidate | null {
  const websites = tabs.filter(
    (tab) => tab.id != null && tab.id !== ownTabId && isScannableWebUrl(tab.url),
  );
  websites.sort((left, right) => {
    const activeDelta = Number(Boolean(right.active)) - Number(Boolean(left.active));
    if (activeDelta !== 0) {
      return activeDelta;
    }
    return (right.lastAccessed ?? 0) - (left.lastAccessed ?? 0);
  });
  return websites[0] ?? null;
}

/**
 * Looks for an otpauth:// QR code on the website tab. Checks images on the page
 * first, then a screenshot of that window.
 */
export async function scanCurrentTabForOtpauth(): Promise<string | null> {
  const pending = readCurrentWebsiteQr();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), SCAN_TIMEOUT_MS);
  });
  try {
    return await Promise.race([pending, timeout]);
  } catch {
    return null;
  } finally {
    if (timer != null) {
      clearTimeout(timer);
    }
  }
}

async function readCurrentWebsiteQr(): Promise<string | null> {
  const ownTab = await BrowserApi.getCurrentTab();
  const tabs = await BrowserApi.tabsQuery({});
  const target = pickScanTab(tabs, ownTab?.id ?? null);
  if (target?.id == null) {
    return null;
  }

  try {
    const fromPage = await BrowserApi.executeFunctionInTab(target.id, scanPageForOtpauth);
    const direct = otpauthFromPageResult(fromPage);
    if (direct) {
      return direct;
    }
    for (const png of pageResultPngs(fromPage)) {
      const decoded = await detectOtpauthInImage(png);
      if (decoded) {
        return decoded;
      }
    }
  } catch {
    // The page may refuse injection. The screenshot path below still applies.
  }

  try {
    const dataUrl = await BrowserApi.captureVisibleTab(target.windowId);
    if (!dataUrl) {
      return null;
    }
    return await detectOtpauthInImage(dataUrl);
  } catch {
    return null;
  }
}

type PageImage = { data: number[]; width: number; height: number };

export function isAuthenticatorQrPayload(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return normalized.startsWith("otpauth://") || normalized.startsWith("otpauth-migration://");
}

/** Turns the injected page result into an otpauth URI. */
export function otpauthFromPageResult(result: unknown): string | null {
  if (typeof result === "string" && isAuthenticatorQrPayload(result)) {
    return result;
  }
  if (!isPageImage(result)) {
    return null;
  }
  return readOtpauthFromImageData(Uint8ClampedArray.from(result.data), result.width, result.height);
}

function pageResultPngs(result: unknown): string[] {
  if (result == null || typeof result !== "object") {
    return [];
  }
  const pngs = (result as { pngs?: unknown }).pngs;
  if (!Array.isArray(pngs)) {
    return [];
  }
  return pngs.filter((png): png is string => typeof png === "string" && png.startsWith("data:image/"));
}

function isPageImage(value: unknown): value is PageImage {
  if (value == null || typeof value !== "object") {
    return false;
  }
  const image = value as PageImage;
  return Array.isArray(image.data) && image.width > 0 && image.height > 0;
}

export function barcodeDetectorAvailable(): boolean {
  return typeof (globalThis as { BarcodeDetector?: unknown }).BarcodeDetector === "function";
}

/** Reads an otpauth URI from raw RGBA pixels. Used when the browser has no BarcodeDetector. */
export function readOtpauthFromImageData(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): string | null {
  try {
    const code = jsQR(data, width, height);
    if (code?.data && isAuthenticatorQrPayload(code.data)) {
      return code.data;
    }
  } catch {
    return null;
  }
  return null;
}

/** Reads a QR image the user picked from disk. Runs in the extension page, not the tab. */
export async function decodeQrPayload(src: string): Promise<string | null> {
  return detectOtpauthInImage(src);
}

/**
 * Injected into the website tab. It must not be `async`: the extension bundle
 * downlevels async to a helper that does not exist on the page.
 */
function scanPageForOtpauth(): Promise<string | { pngs: string[] } | null> {
  const Detector = (globalThis as { BarcodeDetector?: QrDetector }).BarcodeDetector;
  const nodes = Array.from(document.querySelectorAll("img, canvas"));
  const raster = (): { pngs: string[] } | null => {
    const pngs: string[] = [];
    for (const node of nodes) {
      if (pngs.length >= 4) {
        break;
      }
      const source = node as HTMLImageElement | HTMLCanvasElement;
      const width = source instanceof HTMLImageElement ? source.naturalWidth : source.width;
      const height = source instanceof HTMLImageElement ? source.naturalHeight : source.height;
      if (width < 21 || height < 21 || width > 1600 || height > 1600) {
        continue;
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (context == null) {
        continue;
      }
      try {
        context.drawImage(source, 0, 0);
        pngs.push(canvas.toDataURL("image/png"));
      } catch {
        // A tainted canvas is skipped. The screenshot fallback still applies.
      }
    }
    return pngs.length > 0 ? { pngs } : null;
  };

  if (typeof Detector !== "function") {
    return Promise.resolve(raster());
  }
  const detector = new Detector({ formats: ["qr_code"] });
  return nodes
    .reduce<Promise<string | null>>(
      (pending, node) =>
        pending.then((found): Promise<string | null> | string => {
          if (found) {
            return found;
          }
          return detector
            .detect(node as CanvasImageSource)
            .then((codes): string | null => {
              for (const code of codes) {
                if (
                  typeof code.rawValue === "string" &&
                  (code.rawValue.startsWith("otpauth://") ||
                    code.rawValue.startsWith("otpauth-migration://"))
                ) {
                  return code.rawValue;
                }
              }
              return null;
            })
            .catch((): null => null);
        }),
      Promise.resolve(null),
    )
    .then((found) => found ?? raster());
}

type Drawable = CanvasImageSource & { width: number; height: number };

async function detectOtpauthInImage(src: string): Promise<string | null> {
  const image = await loadDrawable(src);
  if (image == null) {
    return null;
  }
  if (barcodeDetectorAvailable()) {
    try {
      const Detector = (globalThis as { BarcodeDetector?: QrDetector }).BarcodeDetector;
      if (typeof Detector === "function") {
        const codes = await new Detector({ formats: ["qr_code"] }).detect(image);
        const value = codes.find((code) =>
          code.rawValue ? isAuthenticatorQrPayload(code.rawValue) : false,
        )?.rawValue;
        if (value) {
          closeDrawable(image);
          return value;
        }
      }
    } catch {
      // BarcodeDetector can reject a data URL. jsQR still reads the pixels.
    }
  }
  const scale = Math.min(1, MAX_DECODE_EDGE / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (context == null) {
    closeDrawable(image);
    return null;
  }
  context.drawImage(image, 0, 0, width, height);
  closeDrawable(image);
  const pixels = context.getImageData(0, 0, width, height);
  return readOtpauthFromImageData(pixels.data, width, height);
}

async function loadDrawable(src: string): Promise<Drawable | null> {
  try {
    const response = await fetch(src);
    if (response.ok && typeof createImageBitmap === "function") {
      const bitmap = await createImageBitmap(await response.blob());
      if (bitmap.width > 0 && bitmap.height > 0) {
        return bitmap;
      }
    }
  } catch {
    // Some extension pages block fetch of a data URL. The image element is the fallback.
  }
  try {
    return await loadImageElement(src);
  } catch {
    return null;
  }
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not load the captured image."));
    image.src = src;
  });
}

function closeDrawable(image: Drawable): void {
  if ("close" in image && typeof image.close === "function") {
    image.close();
  }
}

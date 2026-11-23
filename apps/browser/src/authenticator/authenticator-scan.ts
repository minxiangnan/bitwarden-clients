import jsQR from "jsqr";

import { BrowserApi } from "../platform/browser/browser-api";

type QrDetector = new (options: { formats: string[] }) => {
  detect: (source: CanvasImageSource) => Promise<Array<{ rawValue?: string }>>;
};

/**
 * Looks for an otpauth:// QR code on the current tab. Checks visible images and
 * canvases first, then a screenshot. Screenshots use jsQR when BarcodeDetector is missing.
 */
export async function scanCurrentTabForOtpauth(): Promise<string | null> {
  // Start the capture during the click. A later await drops the user gesture activeTab needs.
  const shotPromise = BrowserApi.captureVisibleTab().catch(() => "");
  const tab = await BrowserApi.getTabFromCurrentWindow();
  if (tab?.id != null) {
    try {
      const fromPage = await BrowserApi.executeFunctionInTab(tab.id, scanPageForOtpauth);
      const png = pageResultPng(fromPage);
      if (png) {
        const decoded = await detectOtpauthInImage(png);
        if (decoded) {
          return decoded;
        }
      }
      const uri = otpauthFromPageResult(fromPage);
      if (uri) {
        return uri;
      }
    } catch {
      // The page may refuse injection. The screenshot path below still applies.
    }
  }

  try {
    const dataUrl = await shotPromise;
    if (!dataUrl) {
      return null;
    }
    return await detectOtpauthInImage(dataUrl);
  } catch {
    return null;
  }
}

type PageImage = { data: number[]; width: number; height: number };

/** Turns the injected page result into an otpauth URI. */
export function otpauthFromPageResult(result: unknown): string | null {
  if (typeof result === "string" && result.startsWith("otpauth://")) {
    return result;
  }
  if (!isPageImage(result)) {
    return null;
  }
  return readOtpauthFromImageData(Uint8ClampedArray.from(result.data), result.width, result.height);
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
  const code = jsQR(data, width, height);
  if (code?.data.startsWith("otpauth://")) {
    return code.data;
  }
  return null;
}

function pageResultPng(result: unknown): string | null {
  if (result == null || typeof result !== "object") {
    return null;
  }
  const png = (result as { png?: unknown }).png;
  return typeof png === "string" && png.startsWith("data:image/") ? png : null;
}

/**
 * Injected into the tab. It must not be `async`: the extension bundle downlevels
 * async to a helper that does not exist on the page.
 */
function scanPageForOtpauth(): Promise<string | PageImage | { png: string } | null> {
  const Detector = (globalThis as { BarcodeDetector?: QrDetector }).BarcodeDetector;
  const nodes = Array.from(document.querySelectorAll("img, canvas"));
  const raster = (): { png: string } | null => {
    for (const node of nodes) {
      const source = node as HTMLImageElement | HTMLCanvasElement;
      const width = source instanceof HTMLImageElement ? source.naturalWidth : source.width;
      const height = source instanceof HTMLImageElement ? source.naturalHeight : source.height;
      if (width < 21 || height < 21 || width > 2000 || height > 2000) {
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
        return { png: canvas.toDataURL("image/png") };
      } catch {
        // A tainted canvas is skipped. The screenshot fallback still applies.
      }
    }
    return null;
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
                if (typeof code.rawValue === "string" && code.rawValue.startsWith("otpauth://")) {
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

async function detectOtpauthInImage(src: string): Promise<string | null> {
  const image = await loadImage(src);
  if (barcodeDetectorAvailable()) {
    try {
      const Detector = (globalThis as { BarcodeDetector?: QrDetector }).BarcodeDetector;
      if (typeof Detector === "function") {
        const codes = await new Detector({ formats: ["qr_code"] }).detect(image);
        const value = codes.find((code) => code.rawValue?.startsWith("otpauth://"))?.rawValue;
        if (value) {
          return value;
        }
      }
    } catch {
      // BarcodeDetector can reject a data URL. jsQR still reads the pixels.
    }
  }
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;
  const context = canvas.getContext("2d");
  if (context == null || canvas.width === 0 || canvas.height === 0) {
    return null;
  }
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  return readOtpauthFromImageData(pixels.data, canvas.width, canvas.height);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not load the captured image."));
    image.src = src;
  });
}

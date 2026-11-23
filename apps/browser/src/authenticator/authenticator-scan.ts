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
  const tab = await BrowserApi.getTabFromCurrentWindow();
  if (tab?.id == null) {
    return null;
  }

  try {
    const fromPage = await BrowserApi.executeFunctionInTab(tab.id, scanPageForOtpauth);
    if (typeof fromPage === "string" && fromPage.startsWith("otpauth://")) {
      return fromPage;
    }
  } catch {
    // The page may refuse injection. The screenshot path below still applies.
  }

  try {
    const dataUrl = await BrowserApi.captureVisibleTab();
    if (!dataUrl) {
      return null;
    }
    return await detectOtpauthInImage(dataUrl);
  } catch {
    return null;
  }
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

async function scanPageForOtpauth(): Promise<string | null> {
  const Detector = (globalThis as { BarcodeDetector?: QrDetector }).BarcodeDetector;
  if (typeof Detector !== "function") {
    return null;
  }
  const detector = new Detector({ formats: ["qr_code"] });
  const nodes = Array.from(document.querySelectorAll("img, canvas"));
  for (const node of nodes) {
    try {
      const codes = await detector.detect(node as CanvasImageSource);
      for (const code of codes) {
        if (typeof code.rawValue === "string" && code.rawValue.startsWith("otpauth://")) {
          return code.rawValue;
        }
      }
    } catch {
      // One unreadable image does not stop the rest of the page.
    }
  }
  return null;
}

async function detectOtpauthInImage(src: string): Promise<string | null> {
  const image = await loadImage(src);
  if (barcodeDetectorAvailable()) {
    const Detector = (globalThis as { BarcodeDetector?: QrDetector }).BarcodeDetector;
    if (typeof Detector === "function") {
      const codes = await new Detector({ formats: ["qr_code"] }).detect(image);
      const value = codes.find((code) => code.rawValue?.startsWith("otpauth://"))?.rawValue;
      if (value) {
        return value;
      }
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

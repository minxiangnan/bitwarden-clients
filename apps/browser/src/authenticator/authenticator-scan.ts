import { BrowserApi } from "../platform/browser/browser-api";

type QrDetector = new (options: { formats: string[] }) => {
  detect: (source: CanvasImageSource) => Promise<Array<{ rawValue?: string }>>;
};

/**
 * Looks for an otpauth:// QR code on the current tab. Checks visible images and
 * canvases first, then a screenshot of the tab when the page itself has no image.
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

  if (!barcodeDetectorAvailable()) {
    return null;
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
  const Detector = (globalThis as { BarcodeDetector?: QrDetector }).BarcodeDetector;
  if (typeof Detector !== "function") {
    return null;
  }
  const image = await loadImage(src);
  const codes = await new Detector({ formats: ["qr_code"] }).detect(image);
  return codes.find((code) => code.rawValue?.startsWith("otpauth://"))?.rawValue ?? null;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not read the tab screenshot."));
    image.src = src;
  });
}

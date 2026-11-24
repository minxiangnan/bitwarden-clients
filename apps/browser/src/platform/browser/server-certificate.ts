import { BrowserApi } from "./browser-api";

const CERT_ERROR = "CERT";

/**
 * Returns whether Chrome rejected the server certificate for this URL.
 * The cipher client runs in the service worker, where an untrusted certificate
 * fails the save with a generic network error.
 */
export function serverCertificateUntrusted(url: string): Promise<boolean> {
  if (!url.startsWith("https://") || chrome.webRequest?.onErrorOccurred == null) {
    return Promise.resolve(false);
  }

  let pattern = "";
  try {
    pattern = `${new URL(url).origin}/*`;
  } catch {
    return Promise.resolve(false);
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = (untrusted: boolean) => {
      if (settled) {
        return;
      }
      settled = true;
      BrowserApi.removeListener(chrome.webRequest.onErrorOccurred, listener);
      resolve(untrusted);
    };
    const listener = (details: chrome.webRequest.WebResponseErrorDetails) => {
      if (details.error?.includes(CERT_ERROR)) {
        finish(true);
      }
    };
    BrowserApi.addListener(chrome.webRequest.onErrorOccurred, listener, { urls: [pattern] });
    fetch(url, { method: "GET" }).then(
      () => finish(false),
      () => setTimeout(() => finish(false), 400),
    );
    setTimeout(() => finish(false), 1500);
  });
}

import { applyPageSubmitHook } from "../content/page-submit-hook-impl";
import { sendExtensionMessage } from "../utils";

/**
 * Page-world hook. A content script cannot wrap the page's
 * `HTMLFormElement.prototype.submit`, and that method does not fire `submit`.
 * The hook runs in the page, remembers the last login value, and asks the
 * content script to flush before the real submit.
 *
 * Chrome installs it from `content/page-submit-hook.js` (`world: "MAIN"`).
 * Firefox MV2 uses `wrappedJSObject` and `exportFunction`. Neither path
 * inserts an inline `<script>`, which a strict `script-src` would block.
 */
export function installProgrammaticLoginCapture(doc: Document, flush: () => void): () => void {
  const onFlush = () => flush();
  doc.addEventListener("submit", onFlush, true);
  doc.addEventListener("zh-login-flush", onFlush, true);
  ensurePageSubmitHook(doc);
  return () => {
    doc.removeEventListener("submit", onFlush, true);
    doc.removeEventListener("zh-login-flush", onFlush, true);
  };
}

function ensurePageSubmitHook(doc: Document): void {
  const root = doc.documentElement;
  if (!root || root.getAttribute("data-zh-login-hook") === "1") {
    return;
  }

  const view = doc.defaultView as (Window & { wrappedJSObject?: Window }) | null;
  const pageWindow = view?.wrappedJSObject;
  if (pageWindow) {
    if (applyPageSubmitHook(pageWindow)) {
      root.setAttribute("data-zh-login-hook", "1");
    }
    return;
  }

  // Isolated content scripts share the DOM but not the page's prototypes.
  // Ask the background to inject the MAIN-world file. Unit tests have no
  // extension id, so they install directly into this window.
  if (chrome.runtime?.id) {
    void sendExtensionMessage("zhInstallPageSubmitHook");
    return;
  }

  if (applyPageSubmitHook(view ?? (globalThis as unknown as Window))) {
    root.setAttribute("data-zh-login-hook", "1");
  }
}

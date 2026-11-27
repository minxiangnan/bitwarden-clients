import { applyPageSubmitHook } from "./page-submit-hook-impl";

/**
 * Manifest V3 content script, `world: "MAIN"`. The browser injects this file,
 * so the page's script-src does not apply. Firefox MV2 has no MAIN world and
 * installs the same hook through `wrappedJSObject` instead.
 */
(function installZhPageSubmitHook() {
  const doc = document;
  if (doc.contentType && doc.contentType !== "text/html") {
    return;
  }

  const run = () => {
    const root = doc.documentElement;
    if (!root) {
      return;
    }
    if (applyPageSubmitHook(window)) {
      root.setAttribute("data-zh-login-hook", "1");
    }
  };

  if (doc.documentElement) {
    run();
    return;
  }
  doc.addEventListener("DOMContentLoaded", run, { once: true });
})();

import { BrowserApi } from "../../platform/browser/browser-api";

const INSTALL_PAGE_SUBMIT_HOOK = "zhInstallPageSubmitHook";

/**
 * Fallback for a frame whose MAIN-world content script did not run
 * (for example a frame created before the extension was installed).
 * `executeScript` in the MAIN world is injected by the browser, not parsed
 * as an inline page script.
 */
BrowserApi.messageListener(INSTALL_PAGE_SUBMIT_HOOK, (message, sender) => {
  if (message?.command !== INSTALL_PAGE_SUBMIT_HOOK || !BrowserApi.isManifestVersion(3)) {
    return;
  }
  const tabId = sender.tab?.id;
  if (tabId == null) {
    return;
  }

  const details: chrome.extensionTypes.InjectDetails = {
    file: "content/page-submit-hook.js",
    runAt: "document_start",
  };
  if (typeof sender.frameId === "number") {
    details.frameId = sender.frameId;
  }

  void BrowserApi.executeScriptInTab(tabId, details, {
    world: chrome.scripting.ExecutionWorld.MAIN,
  }).catch((): void => undefined);
});

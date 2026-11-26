import { isIpcMessage, reconstructIpcMessage } from "@bitwarden/common/platform/ipc/ipc-message";

import { connectPagePort, sendRuntimeMessage } from "../../browser/runtime-channel";

const IPC_CONTENT_SCRIPT_PORT_NAME = "ipc-content-script-port";

// Web -> Background
function sendExtensionMessage(message: unknown) {
  if (
    typeof browser !== "undefined" &&
    typeof browser.runtime !== "undefined" &&
    typeof browser.runtime.sendMessage !== "undefined"
  ) {
    void Promise.resolve(browser.runtime.sendMessage(message)).catch((): void => undefined);
    return;
  }

  sendRuntimeMessage(message);
}

function handleWindowMessage(event: MessageEvent) {
  if (event.origin !== window.origin) {
    return;
  }

  if (isIpcMessage(event.data)) {
    // Relay a freshly built message rather than the page's object so a hostile page cannot
    // smuggle extra properties onto the shared runtime message bus. See reconstructIpcMessage.
    sendExtensionMessage(reconstructIpcMessage(event.data));
  }
}

// Background -> Web
function handleRuntimeMessage(message: unknown) {
  if (isIpcMessage(message)) {
    void window.postMessage(message);
  }
}

function addRuntimeMessageListener() {
  if (
    typeof browser !== "undefined" &&
    typeof browser.runtime !== "undefined" &&
    typeof browser.runtime.onMessage !== "undefined"
  ) {
    browser.runtime.onMessage.addListener(handleRuntimeMessage);
    return;
  }

  // eslint-disable-next-line no-restricted-syntax -- This doesn't run in the popup but in the content script
  chrome.runtime.onMessage.addListener(handleRuntimeMessage);
}

function removeRuntimeMessageListener() {
  if (
    typeof browser !== "undefined" &&
    typeof browser.runtime !== "undefined" &&
    typeof browser.runtime.onMessage !== "undefined"
  ) {
    browser.runtime.onMessage.removeListener(handleRuntimeMessage);
    return;
  }

  chrome.runtime.onMessage.removeListener(handleRuntimeMessage);
}

/**
 * Opens a long-lived port whose only purpose is to surface extension-context
 * teardown via `onDisconnect`. When the extension is reloaded (e.g. via
 * `chrome.runtime.reload()` on process reload), this fires while the runtime
 * is still functional, letting us detach our listeners before a freshly
 * re-injected content script registers its own.
 */
function teardown() {
  window.removeEventListener("message", handleWindowMessage);
  removeRuntimeMessageListener();
}

// The background service worker re-injects this script into already-open tabs
// whenever it (re)starts (see ipc-content-script-manager.service.ts). A plain
// service-worker restart does not invalidate the extension context, so a tab
// can still hold a live instance when the re-injection runs. All injections in
// a frame share one isolated world, so each instance exposes its teardown here
// and the next injection replaces (rather than stacks on top of) its
// predecessor.
// This keeps exactly one set of listeners and one port alive, avoiding the
// duplicate IPC message delivery that stacked listeners would cause.
const ipcWindow = window as Window & {
  __bitwardenIpcContentScript?: { teardown: () => void };
};

ipcWindow.__bitwardenIpcContentScript?.teardown();

window.addEventListener("message", handleWindowMessage);
addRuntimeMessageListener();
connectPagePort({ name: IPC_CONTENT_SCRIPT_PORT_NAME }, { onDisconnect: teardown });

ipcWindow.__bitwardenIpcContentScript = { teardown };

/**
 * Chrome logs "Unchecked runtime.lastError" on chrome://extensions when a
 * sendMessage/tabs.sendMessage callback, or a Port onDisconnect listener,
 * runs while lastError is set and never reads it. The back/forward cache
 * closes long-lived ports with a specific lastError, and content scripts are
 * not re-injected when the page is restored, so those ports have to be
 * disconnected before the cache and opened again on pageshow.
 */

const PAGE_CACHE_DISCONNECT =
  "The page keeping the extension port is moved into back/forward cache, so the message channel is closed.";

/** Reads `chrome.runtime.lastError` so Chrome does not report it as unchecked. */
export function consumeRuntimeLastError(): string | undefined {
  try {
    return chrome.runtime?.lastError?.message;
  } catch {
    return undefined;
  }
}

/** True when Chrome closed the port because the page entered the back/forward cache. */
export function isPageCacheDisconnect(message: string | undefined): boolean {
  return typeof message === "string" && message.includes("back/forward cache");
}

export { PAGE_CACHE_DISCONNECT };

type PagePortHandlers = {
  onMessage?: (message: unknown, port: chrome.runtime.Port) => void;
  /**
   * Extension context invalidated, or the port closed for a reason other than
   * the back/forward cache. Not called when the page is only suspended.
   */
  onDisconnect?: (port: chrome.runtime.Port) => void;
};

/**
 * Connects a long-lived port from a page (content script or extension iframe).
 * On `pagehide` with `persisted`, the port is disconnected before Chrome
 * closes it. On `pageshow` with `persisted`, a new port is opened in the same
 * JavaScript world. A disconnect that is not caused by the page cache still
 * runs `onDisconnect`.
 */
export function connectPagePort(
  connectInfo: chrome.runtime.ConnectInfo,
  handlers: PagePortHandlers = {},
): { disconnect: () => void } {
  let port: chrome.runtime.Port | null = null;
  let suspendedForPageCache = false;
  let closed = false;
  const page: EventTarget | undefined =
    typeof globalThis.addEventListener === "function" ? globalThis : undefined;

  const detachPageListeners = () => {
    page?.removeEventListener("pagehide", onPageHide);
    page?.removeEventListener("pageshow", onPageShow);
  };

  const onDisconnect = (disconnected: chrome.runtime.Port) => {
    const message = consumeRuntimeLastError();
    port = null;
    if (closed) {
      return;
    }
    if (suspendedForPageCache || isPageCacheDisconnect(message)) {
      suspendedForPageCache = true;
      return;
    }
    closed = true;
    detachPageListeners();
    handlers.onDisconnect?.(disconnected);
  };

  const connect = () => {
    if (closed) {
      return;
    }
    try {
      port = chrome.runtime.connect(connectInfo);
    } catch {
      consumeRuntimeLastError();
      return;
    }
    if (handlers.onMessage) {
      port.onMessage.addListener(handlers.onMessage);
    }
    port.onDisconnect.addListener(onDisconnect);
  };

  const onPageHide = (event: Event) => {
    if (!(event as PageTransitionEvent).persisted || port == null) {
      return;
    }
    suspendedForPageCache = true;
    const current = port;
    try {
      current.disconnect();
    } catch {
      consumeRuntimeLastError();
    }
  };

  const onPageShow = (event: Event) => {
    if (!(event as PageTransitionEvent).persisted || closed) {
      return;
    }
    suspendedForPageCache = false;
    if (port != null) {
      return;
    }
    connect();
  };

  page?.addEventListener("pagehide", onPageHide);
  page?.addEventListener("pageshow", onPageShow);
  connect();

  return {
    disconnect() {
      if (closed) {
        return;
      }
      closed = true;
      detachPageListeners();
      const current = port;
      port = null;
      try {
        current?.disconnect();
      } catch {
        consumeRuntimeLastError();
      }
    },
  };
}

/**
 * Sends a one-shot runtime message and always reads `lastError` in the
 * callback. The promise Chrome returns alongside the callback is swallowed so
 * a missing receiver is not an uncaught rejection.
 */
export function sendRuntimeMessage(
  message: unknown,
  responseCallback?: (response: unknown) => void,
): void {
  try {
    const sent = chrome.runtime.sendMessage(message, (response: unknown) => {
      if (consumeRuntimeLastError()) {
        return;
      }
      responseCallback?.(response);
    });
    void Promise.resolve(sent).catch((): void => undefined);
  } catch {
    consumeRuntimeLastError();
  }
}

/** `port.postMessage` has no callback. A dead port throws; read lastError either way. */
export function postToRuntimePort(
  port: chrome.runtime.Port | null | undefined,
  message: unknown,
): void {
  if (port == null) {
    return;
  }
  try {
    port.postMessage(message);
  } catch (error) {
    consumeRuntimeLastError();
    throw error;
  }
}

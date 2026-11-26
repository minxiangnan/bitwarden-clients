import {
  PAGE_CACHE_DISCONNECT,
  connectPagePort,
  consumeRuntimeLastError,
  isPageCacheDisconnect,
  sendRuntimeMessage,
} from "./runtime-channel";

function pageTransition(type: "pagehide" | "pageshow", persisted: boolean): Event {
  const event = new Event(type);
  Object.defineProperty(event, "persisted", { value: persisted });
  return event;
}

describe("runtime channel", () => {
  const originalLastError = Object.getOwnPropertyDescriptor(chrome.runtime, "lastError");

  afterEach(() => {
    if (originalLastError) {
      Object.defineProperty(chrome.runtime, "lastError", originalLastError);
    } else {
      delete (chrome.runtime as { lastError?: chrome.runtime.LastError }).lastError;
    }
    jest.restoreAllMocks();
  });

  describe("consumeRuntimeLastError", () => {
    it("returns the message and therefore checks lastError", () => {
      Object.defineProperty(chrome.runtime, "lastError", {
        configurable: true,
        get: () => ({ message: PAGE_CACHE_DISCONNECT }),
      });

      expect(consumeRuntimeLastError()).toBe(PAGE_CACHE_DISCONNECT);
      expect(isPageCacheDisconnect(PAGE_CACHE_DISCONNECT)).toBe(true);
    });
  });

  describe("sendRuntimeMessage", () => {
    it("reads lastError in the callback and skips the response handler", () => {
      const response = jest.fn();
      let reads = 0;
      Object.defineProperty(chrome.runtime, "lastError", {
        configurable: true,
        get: () => {
          reads += 1;
          return { message: PAGE_CACHE_DISCONNECT };
        },
      });
      jest.spyOn(chrome.runtime, "sendMessage").mockImplementation(((
        _message: unknown,
        callback: (response: unknown) => void,
      ) => {
        callback(undefined);
        return Promise.resolve();
      }) as typeof chrome.runtime.sendMessage);

      sendRuntimeMessage({ command: "collectPageDetails" }, response);

      expect(reads).toBeGreaterThan(0);
      expect(response).not.toHaveBeenCalled();
    });

    it("delivers the response when lastError is empty", () => {
      const response = jest.fn();
      jest.spyOn(chrome.runtime, "sendMessage").mockImplementation(((
        _message: unknown,
        callback: (response: unknown) => void,
      ) => {
        callback({ ok: true });
        return Promise.resolve();
      }) as typeof chrome.runtime.sendMessage);

      sendRuntimeMessage({ command: "collectPageDetails" }, response);

      expect(response).toHaveBeenCalledWith({ ok: true });
    });
  });

  describe("connectPagePort", () => {
    function mockPort() {
      const disconnectListeners: Array<(port: chrome.runtime.Port) => void> = [];
      const port = {
        name: "test-port",
        disconnect: jest.fn(() => {
          disconnectListeners.forEach((listener) =>
            listener(port as unknown as chrome.runtime.Port),
          );
        }),
        onDisconnect: {
          addListener: jest.fn((listener: (port: chrome.runtime.Port) => void) => {
            disconnectListeners.push(listener);
          }),
          removeListener: jest.fn(),
        },
        onMessage: {
          addListener: jest.fn(),
          removeListener: jest.fn(),
        },
      };
      return port;
    }

    it("disconnects on a persisted pagehide and reconnects on pageshow without tearing down", () => {
      const ports = [mockPort(), mockPort()];
      let connectCount = 0;
      jest.spyOn(chrome.runtime, "connect").mockImplementation(() => {
        const port = ports[connectCount] ?? mockPort();
        connectCount += 1;
        return port as unknown as chrome.runtime.Port;
      });
      const onDisconnect = jest.fn();

      connectPagePort({ name: "autofill-injected-script-port" }, { onDisconnect });

      expect(chrome.runtime.connect).toHaveBeenCalledTimes(1);
      window.dispatchEvent(pageTransition("pagehide", true));
      expect(ports[0].disconnect).toHaveBeenCalled();
      expect(onDisconnect).not.toHaveBeenCalled();

      window.dispatchEvent(pageTransition("pageshow", true));
      expect(chrome.runtime.connect).toHaveBeenCalledTimes(2);
      expect(onDisconnect).not.toHaveBeenCalled();
    });

    it("does not tear down when Chrome already closed the port for the page cache", () => {
      const port = mockPort();
      jest.spyOn(chrome.runtime, "connect").mockReturnValue(port as unknown as chrome.runtime.Port);
      Object.defineProperty(chrome.runtime, "lastError", {
        configurable: true,
        get: () => ({ message: PAGE_CACHE_DISCONNECT }),
      });
      const onDisconnect = jest.fn();
      connectPagePort({ name: "autofill-injected-script-port" }, { onDisconnect });

      port.onDisconnect.addListener.mock.calls[0][0](port as unknown as chrome.runtime.Port);

      expect(onDisconnect).not.toHaveBeenCalled();
    });

    it("runs onDisconnect when the extension context is actually gone", () => {
      const port = mockPort();
      jest.spyOn(chrome.runtime, "connect").mockReturnValue(port as unknown as chrome.runtime.Port);
      const onDisconnect = jest.fn();
      connectPagePort({ name: "autofill-injected-script-port" }, { onDisconnect });

      port.onDisconnect.addListener.mock.calls[0][0](port as unknown as chrome.runtime.Port);

      expect(onDisconnect).toHaveBeenCalledWith(port);
    });
  });
});

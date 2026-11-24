import jsQR from "jsqr";

import { BrowserApi } from "../platform/browser/browser-api";

import {
  otpauthFromPageResult,
  pickScanTab,
  readOtpauthFromImageData,
  scanCurrentTabForOtpauth,
} from "./authenticator-scan";

jest.mock("jsqr", () => jest.fn());

describe("readOtpauthFromImageData", () => {
  const jsQRMock = jsQR as jest.Mock;

  beforeEach(() => {
    jsQRMock.mockReset();
  });

  it("returns an otpauth URI decoded by jsQR", () => {
    jsQRMock.mockReturnValue({ data: "otpauth://totp/Ada?secret=WQIQ25BRKZYCJVYP" });

    expect(readOtpauthFromImageData(new Uint8ClampedArray(4), 1, 1)).toBe(
      "otpauth://totp/Ada?secret=WQIQ25BRKZYCJVYP",
    );
  });

  it("decodes pixel data returned from a page without BarcodeDetector", () => {
    jsQRMock.mockReturnValue({ data: "otpauth://totp/Qr?secret=JBSWY3DPEHPK3PXP" });

    expect(otpauthFromPageResult({ data: [0, 0, 0, 255], width: 1, height: 1 })).toBe(
      "otpauth://totp/Qr?secret=JBSWY3DPEHPK3PXP",
    );
    expect(otpauthFromPageResult("otpauth://totp/Direct?secret=JBSWY3DPEHPK3PXP")).toBe(
      "otpauth://totp/Direct?secret=JBSWY3DPEHPK3PXP",
    );
    expect(otpauthFromPageResult(null)).toBeNull();
  });

  it("ignores a QR code that is not an otpauth URI", () => {
    jsQRMock.mockReturnValue({ data: "https://example.com" });

    expect(readOtpauthFromImageData(new Uint8ClampedArray(4), 1, 1)).toBeNull();
  });

  it("returns null when the decoder throws", () => {
    jsQRMock.mockImplementation(() => {
      throw new Error("bad image");
    });

    expect(readOtpauthFromImageData(new Uint8ClampedArray(4), 1, 1)).toBeNull();
  });
});

describe("pickScanTab", () => {
  const extensionTab = {
    id: 1,
    windowId: 10,
    active: true,
    lastAccessed: 50,
    url: "chrome-extension://ext/popup/index.html",
  };
  const website = {
    id: 2,
    windowId: 10,
    active: false,
    lastAccessed: 40,
    url: "https://example.com/qr",
  };

  it("skips the popped-out extension tab and reads the website behind it", () => {
    expect(pickScanTab([extensionTab, website], extensionTab.id)).toEqual(website);
  });

  it("reads the active website when the toolbar popup is not a tab", () => {
    const active = { ...website, active: true, lastAccessed: 10 };
    const older = {
      id: 3,
      windowId: 10,
      active: false,
      lastAccessed: 1,
      url: "https://example.com/older",
    };

    expect(pickScanTab([extensionTab, older, active], null)).toEqual(active);
  });

  it("returns null when the only open tab is the extension", () => {
    expect(pickScanTab([extensionTab], extensionTab.id)).toBeNull();
  });
});

describe("scanCurrentTabForOtpauth", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("injects into the website tab from a popped-out extension page", async () => {
    jest.spyOn(BrowserApi, "getCurrentTab").mockResolvedValue({ id: 1 } as chrome.tabs.Tab);
    jest.spyOn(BrowserApi, "tabsQuery").mockResolvedValue([
      {
        id: 1,
        windowId: 10,
        active: true,
        url: "chrome-extension://ext/popup/index.html?uilocation=popout",
      },
      { id: 2, windowId: 11, active: true, lastAccessed: 5, url: "https://bank.example/qr" },
    ] as chrome.tabs.Tab[]);
    const inject = jest
      .spyOn(BrowserApi, "executeFunctionInTab")
      .mockResolvedValue("otpauth://totp/QR:ada?secret=JBSWY3DPEHPK3PXP");
    jest.spyOn(BrowserApi, "captureVisibleTab").mockResolvedValue("");

    await expect(scanCurrentTabForOtpauth()).resolves.toBe(
      "otpauth://totp/QR:ada?secret=JBSWY3DPEHPK3PXP",
    );
    expect(inject).toHaveBeenCalledWith(2, expect.any(Function));
  });

  it("captures the website window when the page has no readable image", async () => {
    jest.spyOn(BrowserApi, "getCurrentTab").mockResolvedValue(null);
    jest.spyOn(BrowserApi, "tabsQuery").mockResolvedValue([
      { id: 4, windowId: 8, active: true, url: "https://example.com/qr" },
    ] as chrome.tabs.Tab[]);
    jest.spyOn(BrowserApi, "executeFunctionInTab").mockResolvedValue(null);
    const capture = jest.spyOn(BrowserApi, "captureVisibleTab").mockResolvedValue("");

    await expect(scanCurrentTabForOtpauth()).resolves.toBeNull();
    expect(capture).toHaveBeenCalledWith(8);
  });
});

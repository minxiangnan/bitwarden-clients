import jsQR from "jsqr";

import { otpauthFromPageResult, readOtpauthFromImageData } from "./authenticator-scan";

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

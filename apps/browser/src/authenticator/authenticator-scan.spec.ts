import jsQR from "jsqr";

import { readOtpauthFromImageData } from "./authenticator-scan";

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

  it("ignores a QR code that is not an otpauth URI", () => {
    jsQRMock.mockReturnValue({ data: "https://example.com" });

    expect(readOtpauthFromImageData(new Uint8ClampedArray(4), 1, 1)).toBeNull();
  });
});

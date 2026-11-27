/* eslint-disable @typescript-eslint/no-require-imports */
const {
  CHROME_EXTENSION_PUBLIC_KEY,
  extensionIdFromPublicKey,
} = require("../../../webpack/extension-public-key");
const { transform } = require("../../../webpack/manifest");

const STABLE_EXTENSION_ID = "pchdkkpmcahbbojjppmjjcfnnpdlajak";

describe("stable unpacked extension id", () => {
  const source = Buffer.from(
    JSON.stringify({ name: "验证器版", manifest_version: 3, version: "1" }),
  );

  it("derives one id from the public key", () => {
    expect(extensionIdFromPublicKey(CHROME_EXTENSION_PUBLIC_KEY)).toBe(STABLE_EXTENSION_ID);
  });

  it("writes that public key into the Chrome and Edge manifests only", () => {
    const chrome = JSON.parse(transform("chrome")(source).toString());
    const edge = JSON.parse(transform("edge")(source).toString());
    const firefox = JSON.parse(transform("firefox")(source).toString());

    expect(chrome.key).toBe(CHROME_EXTENSION_PUBLIC_KEY);
    expect(edge.key).toBe(CHROME_EXTENSION_PUBLIC_KEY);
    expect(firefox.key).toBeUndefined();
    expect(extensionIdFromPublicKey(chrome.key)).toBe(STABLE_EXTENSION_ID);
    expect(extensionIdFromPublicKey(edge.key)).toBe(STABLE_EXTENSION_ID);
  });
});

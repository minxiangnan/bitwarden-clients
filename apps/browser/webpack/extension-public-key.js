const crypto = require("crypto");

/**
 * SPKI public key for the Chrome and Edge unpacked extension id.
 * The matching private key is not in this repository.
 */
const CHROME_EXTENSION_PUBLIC_KEY =
  "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA53lc6gcVaKodZMfTQK65+GulHP914l6/1NgTtpEaJ40DRQN0OdcjstLNORKPe/OcAPCdpq03mLZs8A79AYbcpUht9NRtX4hHLXvM23uZ1LNXbiXAPGE6Cu6yCspbXYgD+NTCjeY2MZIG9XZHHDjIHTH0gGf3cF0hvYOvudsyAqb0qO8y9MvZ2v2bK3ms525TiwmDHHnwthC5D0JI1CY2NBp8WkKFOt4I2mNfx1geHNOKpRs/swusna9qEmIGsJGXS42m9kr71LvyMmpI4ouyYJjI/mbCG933c5vHKGpEmrkScC7S8xFVGbb+0ezQhaY+pBjH0T4y2DrS3ftbDd52swIDAQAB";

/** First 16 bytes of SHA-256, with hex digits mapped to a-p. Same rule as Chromium. */
function extensionIdFromPublicKey(publicKeyBase64) {
  const der = Buffer.from(publicKeyBase64, "base64");
  const digest = crypto.createHash("sha256").update(der).digest();
  return digest
    .subarray(0, 16)
    .toString("hex")
    .replace(/[0-9a-f]/g, (char) => String.fromCharCode(97 + Number.parseInt(char, 16)));
}

module.exports = {
  CHROME_EXTENSION_PUBLIC_KEY,
  extensionIdFromPublicKey,
};

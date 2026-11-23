import assert from "node:assert/strict";
import { test } from "node:test";

import { decodeBase64Url, deriveMcpKey, encodeBase64Url, mcpAad, normalizeAlias, sealField } from "./mcp-crypto";

void test("alias rules match the server", () => {
  assert.equal(normalizeAlias(" GitLab "), "gitlab");
  assert.equal(normalizeAlias("oxy_labs.1"), "oxy_labs.1");
  assert.equal(normalizeAlias("has space"), null);
  assert.equal(normalizeAlias("-bad"), null);
  assert.equal(normalizeAlias(""), null);
});

void test("sealed field is nonce plus ciphertext and round-trips with the same AAD", async () => {
  const token = "vw_mcp_" + encodeBase64Url(crypto.getRandomValues(new Uint8Array(32)));
  const salt = encodeBase64Url(crypto.getRandomValues(new Uint8Array(32)));
  const key = await deriveMcpKey(token, salt);
  const aad = mcpAad("user", "authenticator", "11111111-1111-1111-1111-111111111111", "gitlab", "secret");
  const packed = await sealField(key, aad, "GEZDGNBVGY3TQOJQ");
  const bytes = decodeBase64Url(packed);
  assert.ok(bytes.length > 12 + 16);

  const opened = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: bytes.slice(0, 12), additionalData: aad },
    await crypto.subtle.deriveKey(
      {
        name: "HKDF",
        hash: "SHA-256",
        salt: decodeBase64Url(salt),
        info: new TextEncoder().encode("vaultwarden-mcp-totp-v1"),
      },
      await crypto.subtle.importKey("raw", new TextEncoder().encode(token), "HKDF", false, ["deriveKey"]),
      { name: "AES-GCM", length: 256 },
      false,
      ["decrypt"],
    ),
    bytes.slice(12),
  );
  assert.equal(new TextDecoder().decode(opened), "GEZDGNBVGY3TQOJQ");
});

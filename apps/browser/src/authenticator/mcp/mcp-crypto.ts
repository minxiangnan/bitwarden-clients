/**
 * Second ciphertext for an opted-in TOTP secret.
 * Must match vaultwarden `src/mcp/crypto.rs` and `scripts/mcp-crypto.mjs`:
 *
 * key = HKDF-SHA256(ikm = utf8(token), salt = keySalt, info = "vaultwarden-mcp-totp-v1")
 * packed = base64url(nonce[12] || AES-256-GCM(plaintext, aad) || tag[16])
 * aad = utf8("v1|{field}|{userId}|{source}|{sourceId}|{alias}")
 */

const HKDF_INFO: Uint8Array<ArrayBuffer> = new TextEncoder().encode("vaultwarden-mcp-totp-v1");

export function normalizeAlias(raw: string): string | null {
  const alias = raw.trim().toLowerCase();
  if (alias.length < 1 || alias.length > 64 || /\s/.test(alias)) {
    return null;
  }
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(alias)) {
    return null;
  }
  return alias;
}

export function mcpAad(
  userId: string,
  source: string,
  sourceId: string,
  alias: string,
  field: string,
): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(`v1|${field}|${userId}|${source}|${sourceId}|${alias}`);
}

export function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function decodeBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const pad = value.length % 4 === 0 ? "" : "=".repeat(4 - (value.length % 4));
  const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

export async function deriveMcpKey(token: string, saltB64: string): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(token), "HKDF", false, [
    "deriveKey",
  ]);
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: decodeBase64Url(saltB64),
      info: HKDF_INFO,
    },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"],
  );
}

export async function sealField(
  key: CryptoKey,
  aad: Uint8Array<ArrayBuffer>,
  plaintext: string,
): Promise<string> {
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce, additionalData: aad },
      key,
      new TextEncoder().encode(plaintext),
    ),
  );
  const packed = new Uint8Array(nonce.length + cipher.length);
  packed.set(nonce, 0);
  packed.set(cipher, nonce.length);
  return encodeBase64Url(packed);
}

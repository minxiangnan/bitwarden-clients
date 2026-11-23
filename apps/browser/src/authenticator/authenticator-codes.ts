import { AuthenticatorKinds, AuthenticatorKind } from "./authenticator-meta";
import { AuthenticatorAlgorithm, AuthenticatorEntryView } from "./authenticator.models";

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const STEAM = "23456789BCDFGHJKMNPQRTVWXY";

export function decodeBase32(secret: string): Uint8Array | null {
  const normalized = secret.replace(/=+$/g, "").replace(/\s+/g, "").toUpperCase();
  if (!normalized || /[^A-Z2-7]/.test(normalized)) {
    return null;
  }
  let buffer = 0;
  let bitsLeft = 0;
  const bytes: number[] = [];
  for (const char of normalized) {
    const index = BASE32.indexOf(char);
    if (index < 0) {
      return null;
    }
    buffer = (buffer << 5) | index;
    bitsLeft += 5;
    if (bitsLeft >= 8) {
      bitsLeft -= 8;
      bytes.push((buffer >> bitsLeft) & 0xff);
      buffer &= (1 << bitsLeft) - 1;
    }
  }
  return Uint8Array.from(bytes);
}

export function encodeBase32(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      output += BASE32[(value >>> bits) & 31];
    }
  }
  if (bits > 0) {
    output += BASE32[(value << (5 - bits)) & 31];
  }
  return output;
}

function counterBytes(counter: number): Uint8Array {
  const bytes = new Uint8Array(8);
  let value = Math.floor(counter);
  for (let index = 7; index >= 0; index--) {
    bytes[index] = value % 256;
    value = Math.floor(value / 256);
  }
  return bytes;
}

function hashName(algorithm: AuthenticatorAlgorithm): "SHA-1" | "SHA-256" | "SHA-512" {
  if (algorithm === "SHA256") {
    return "SHA-256";
  }
  if (algorithm === "SHA512") {
    return "SHA-512";
  }
  return "SHA-1";
}

async function hmac(
  algorithm: AuthenticatorAlgorithm,
  key: Uint8Array,
  data: Uint8Array,
): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key as BufferSource,
    { name: "HMAC", hash: hashName(algorithm) },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, data as BufferSource);
  return new Uint8Array(signature);
}

function dynamicTruncate(mac: Uint8Array, digits: number): string {
  const offset = mac[mac.length - 1] & 0x0f;
  const binary =
    ((mac[offset] & 0x7f) << 24) |
    ((mac[offset + 1] & 0xff) << 16) |
    ((mac[offset + 2] & 0xff) << 8) |
    (mac[offset + 3] & 0xff);
  return String(binary % 10 ** digits).padStart(digits, "0");
}

export async function hotpFromKey(
  key: Uint8Array,
  counter: number,
  digits: number,
  algorithm: AuthenticatorAlgorithm,
): Promise<string> {
  const mac = await hmac(algorithm, key, counterBytes(counter));
  return dynamicTruncate(mac, digits);
}

export async function hotpCode(
  secret: string,
  counter: number,
  digits: number,
  algorithm: AuthenticatorAlgorithm,
): Promise<string | null> {
  const key = decodeBase32(secret);
  if (key == null || key.length === 0) {
    return null;
  }
  return hotpFromKey(key, counter, digits, algorithm);
}

export async function totpCode(
  secret: string,
  nowMs: number,
  period: number,
  digits: number,
  algorithm: AuthenticatorAlgorithm,
): Promise<string | null> {
  const step = Math.floor(nowMs / 1000 / period);
  return hotpCode(secret, step, digits, algorithm);
}

export async function steamCode(secret: string, nowMs: number): Promise<string | null> {
  const key = decodeBase32(secret);
  if (key == null || key.length === 0) {
    return null;
  }
  const mac = await hmac("SHA1", key, counterBytes(Math.floor(nowMs / 1000 / 30)));
  const offset = mac[mac.length - 1] & 0x0f;
  let full =
    ((mac[offset] & 0x7f) << 24) |
    ((mac[offset + 1] & 0xff) << 16) |
    ((mac[offset + 2] & 0xff) << 8) |
    (mac[offset + 3] & 0xff);
  let code = "";
  for (let index = 0; index < 5; index++) {
    code += STEAM[full % STEAM.length];
    full = Math.floor(full / STEAM.length);
  }
  return code;
}

export function entryKind(entry: Pick<AuthenticatorEntryView, "kind" | "digits">): AuthenticatorKind {
  if (entry.kind === AuthenticatorKinds.Hotp || entry.kind === AuthenticatorKinds.Steam) {
    return entry.kind;
  }
  if (entry.kind == null && entry.digits === 5) {
    return AuthenticatorKinds.Steam;
  }
  return AuthenticatorKinds.Totp;
}

export function formatAuthenticatorCode(code: string): string {
  if (code.length <= 4) {
    return code;
  }
  const half = Math.floor(code.length / 2);
  return `${code.slice(0, half)} ${code.slice(half)}`;
}

export async function nextTotpCode(
  entry: Pick<AuthenticatorEntryView, "secret" | "period" | "digits" | "algorithm" | "kind">,
  nowMs: number,
): Promise<string | null> {
  if (entryKind(entry) !== AuthenticatorKinds.Totp) {
    return null;
  }
  const period = entry.period || 30;
  return totpCode(entry.secret, nowMs + period * 1000, period, entry.digits, entry.algorithm);
}

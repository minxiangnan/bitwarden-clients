import { decodeBase32, encodeBase32 } from "./authenticator-codes";
import {
  AuthenticatorKind,
  AuthenticatorKinds,
  defaultAuthenticatorMeta,
} from "./authenticator-meta";
import { parseOtpAuthUri } from "./authenticator-otpauth";
import {
  AuthenticatorAlgorithm,
  AuthenticatorAlgorithms,
  DEFAULT_AUTHENTICATOR_DIGITS,
  DEFAULT_AUTHENTICATOR_PERIOD,
} from "./authenticator.models";

export type ImportedAuthenticator = {
  name: string;
  issuer: string;
  secret: string;
  algorithm: AuthenticatorAlgorithm;
  digits: number;
  period: number;
  notes: string;
  favorite: boolean;
  kind: AuthenticatorKind;
  host: string;
  tags: string[];
  counter: number;
};

export type AuthenticatorImportResult = {
  format: string;
  entries: ImportedAuthenticator[];
  /** True when the file is an encrypted export this extension does not decrypt. */
  encrypted: boolean;
};

const EMPTY: AuthenticatorImportResult = { format: "empty", entries: [], encrypted: false };

/** Reads the backup and migration formats a person can produce without a vendor account. */
export function parseAuthenticatorImport(text: string): AuthenticatorImportResult {
  const trimmed = text.trim();
  if (!trimmed) {
    return EMPTY;
  }
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      return parseJsonImport(JSON.parse(trimmed) as unknown);
    } catch {
      return EMPTY;
    }
  }
  const fromUris = parseUriBlob(trimmed);
  if (fromUris.entries.length > 0 || fromUris.encrypted) {
    return fromUris;
  }
  return parseCsv(trimmed);
}

function parseJsonImport(value: unknown): AuthenticatorImportResult {
  if (value == null || typeof value !== "object") {
    return EMPTY;
  }
  const record = value as Record<string, unknown>;
  if (record.format === "zh-authenticator" && Array.isArray(record.items)) {
    return { format: "zh-authenticator", entries: parseOwnExport(record.items), encrypted: false };
  }
  if (record.servicesEncrypted != null) {
    return { format: "2fas", entries: [], encrypted: true };
  }
  if (Array.isArray(record.services)) {
    return { format: "2fas", entries: parseTwoFas(record.services), encrypted: false };
  }
  const header = record.header as { slots?: unknown } | undefined;
  if (header?.slots != null) {
    return { format: "aegis", entries: [], encrypted: true };
  }
  const db = record.db as { entries?: unknown } | undefined;
  if (Array.isArray(db?.entries)) {
    return { format: "aegis", entries: parseAegis(db.entries), encrypted: false };
  }
  if (Array.isArray(record.items)) {
    return { format: "bitwarden-json", entries: parseBitwardenItems(record.items), encrypted: false };
  }
  if (Array.isArray(value)) {
    return { format: "bitwarden-json", entries: parseBitwardenItems(value), encrypted: false };
  }
  return EMPTY;
}

function parseOwnExport(items: unknown[]): ImportedAuthenticator[] {
  const entries: ImportedAuthenticator[] = [];
  for (const item of items) {
    if (item == null || typeof item !== "object") {
      continue;
    }
    const record = item as Record<string, unknown>;
    const parsed =
      typeof record.otpauth === "string" ? parseOtpAuthUri(record.otpauth) : null;
    if (parsed == null) {
      continue;
    }
    entries.push({
      ...parsed,
      notes: typeof record.notes === "string" ? record.notes : "",
      favorite: record.favorite === true,
      kind: kindOr(record.kind, parsed.kind),
      host: typeof record.host === "string" ? record.host.trim().toLowerCase() : "",
      tags: Array.isArray(record.tags)
        ? record.tags.filter((tag): tag is string => typeof tag === "string")
        : [],
      counter: typeof record.counter === "number" ? record.counter : parsed.counter,
    });
  }
  return entries;
}

function parseAegis(items: unknown[]): ImportedAuthenticator[] {
  const entries: ImportedAuthenticator[] = [];
  for (const item of items) {
    if (item == null || typeof item !== "object") {
      continue;
    }
    const record = item as Record<string, unknown>;
    const info = record.info as Record<string, unknown> | undefined;
    const secret = typeof info?.secret === "string" ? info.secret : "";
    if (!secret) {
      continue;
    }
    const type = String(record.type ?? "totp").toLowerCase();
    entries.push(
      draftFromParts({
        name: stringOr(record.name, stringOr(record.issuer, "TOTP")),
        issuer: stringOr(record.issuer, ""),
        secret,
        algorithm: stringOr(info?.algo, "SHA1"),
        digits: numberOr(info?.digits, DEFAULT_AUTHENTICATOR_DIGITS),
        period: numberOr(info?.period, DEFAULT_AUTHENTICATOR_PERIOD),
        notes: stringOr(record.note, ""),
        favorite: record.favorite === true,
        kind: type === "hotp" ? AuthenticatorKinds.Hotp : type === "steam" ? AuthenticatorKinds.Steam : AuthenticatorKinds.Totp,
        counter: numberOr(info?.counter, 0),
      }),
    );
  }
  return entries.filter((entry) => entry.secret.length > 0);
}

function parseTwoFas(items: unknown[]): ImportedAuthenticator[] {
  const entries: ImportedAuthenticator[] = [];
  for (const item of items) {
    if (item == null || typeof item !== "object") {
      continue;
    }
    const record = item as Record<string, unknown>;
    const otp = (record.otp ?? {}) as Record<string, unknown>;
    const secret = stringOr(record.secret, "");
    if (!secret) {
      continue;
    }
    const token = stringOr(otp.tokenType, "TOTP").toUpperCase();
    entries.push(
      draftFromParts({
        name: stringOr(otp.account, stringOr(record.name, "TOTP")),
        issuer: stringOr(otp.issuer, stringOr(record.name, "")),
        secret,
        algorithm: stringOr(otp.algorithm, "SHA1"),
        digits: numberOr(otp.digits, DEFAULT_AUTHENTICATOR_DIGITS),
        period: numberOr(otp.period, DEFAULT_AUTHENTICATOR_PERIOD),
        notes: "",
        favorite: false,
        kind: token === "HOTP" ? AuthenticatorKinds.Hotp : AuthenticatorKinds.Totp,
        counter: numberOr(otp.counter, 0),
      }),
    );
  }
  return entries;
}

function parseBitwardenItems(items: unknown[]): ImportedAuthenticator[] {
  const entries: ImportedAuthenticator[] = [];
  for (const item of items) {
    if (item == null || typeof item !== "object") {
      continue;
    }
    const record = item as Record<string, unknown>;
    const login = record.login as Record<string, unknown> | undefined;
    const totp = stringOr(login?.totp, "");
    if (!totp) {
      continue;
    }
    const parsed = parseOtpAuthUri(totp);
    if (parsed) {
      entries.push({
        ...parsed,
        name: parsed.name || stringOr(record.name, parsed.issuer || "TOTP"),
        notes: "",
        favorite: false,
        host: "",
        tags: [],
      });
      continue;
    }
    entries.push(
      draftFromParts({
        name: stringOr(record.name, "TOTP"),
        issuer: "",
        secret: totp,
        algorithm: "SHA1",
        digits: DEFAULT_AUTHENTICATOR_DIGITS,
        period: DEFAULT_AUTHENTICATOR_PERIOD,
        notes: "",
        favorite: false,
        kind: AuthenticatorKinds.Totp,
        counter: 0,
      }),
    );
  }
  return entries;
}

function parseUriBlob(text: string): AuthenticatorImportResult {
  const entries: ImportedAuthenticator[] = [];
  const migrations = text.match(/otpauth-migration:\/\/\S+/gi) ?? [];
  for (const uri of migrations) {
    entries.push(...decodeMigrationUri(uri));
  }
  const uris = text.match(/otpauth:\/\/(?:totp|hotp)\/\S+/gi) ?? [];
  for (const uri of uris) {
    const parsed = parseOtpAuthUri(uri);
    if (parsed) {
      entries.push({ ...parsed, notes: "", favorite: false, host: "", tags: [] });
    }
  }
  return {
    format: migrations.length > 0 ? "otpauth-migration" : "otpauth",
    entries,
    encrypted: false,
  };
}

export function decodeMigrationUri(uri: string): ImportedAuthenticator[] {
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return [];
  }
  const data = url.searchParams.get("data");
  if (!data) {
    return [];
  }
  const bytes = decodeBase64(data);
  if (bytes == null) {
    return [];
  }
  return decodeMigrationPayload(bytes);
}

export function decodeMigrationPayload(bytes: Uint8Array): ImportedAuthenticator[] {
  const entries: ImportedAuthenticator[] = [];
  walkProtobuf(bytes, (field, wire, value) => {
    if (field === 1 && wire === 2 && value instanceof Uint8Array) {
      const entry = decodeOtpParameters(value);
      if (entry) {
        entries.push(entry);
      }
    }
  });
  return entries;
}

function decodeOtpParameters(bytes: Uint8Array): ImportedAuthenticator | null {
  let secret = new Uint8Array();
  let name = "";
  let issuer = "";
  let algorithm = 1;
  let digitsEnum = 1;
  let otpType = 2;
  let counter = 0;
  walkProtobuf(bytes, (field, wire, value) => {
    if (field === 1 && value instanceof Uint8Array) {
      secret = value;
    } else if (field === 2 && value instanceof Uint8Array) {
      name = decodeUtf8(value);
    } else if (field === 3 && value instanceof Uint8Array) {
      issuer = decodeUtf8(value);
    } else if (field === 4 && typeof value === "number") {
      algorithm = value;
    } else if (field === 5 && typeof value === "number") {
      digitsEnum = value;
    } else if (field === 6 && typeof value === "number") {
      otpType = value;
    } else if (field === 7 && typeof value === "number") {
      counter = value;
    }
  });
  if (secret.length === 0) {
    return null;
  }
  const kind = otpType === 1 ? AuthenticatorKinds.Hotp : AuthenticatorKinds.Totp;
  return draftFromParts({
    name: name || issuer || "TOTP",
    issuer,
    secret: encodeBase32(secret),
    algorithm: algorithm === 2 ? "SHA256" : algorithm === 3 ? "SHA512" : "SHA1",
    digits: digitsEnum === 2 ? 8 : 6,
    period: DEFAULT_AUTHENTICATOR_PERIOD,
    notes: "",
    favorite: false,
    kind,
    counter,
  });
}

function parseCsv(text: string): AuthenticatorImportResult {
  const rows = parseCsvRows(text);
  if (rows.length < 2) {
    return EMPTY;
  }
  const header = rows[0].map((cell) => cell.trim().toLowerCase());
  const totpIndex = header.findIndex((cell) => cell === "login_totp" || cell === "totp");
  if (totpIndex < 0) {
    return EMPTY;
  }
  const nameIndex = header.findIndex((cell) => cell === "name");
  const entries: ImportedAuthenticator[] = [];
  for (const row of rows.slice(1)) {
    const totp = row[totpIndex]?.trim() ?? "";
    if (!totp) {
      continue;
    }
    const name = nameIndex >= 0 ? row[nameIndex] ?? "" : "";
    const parsed = parseOtpAuthUri(totp);
    if (parsed) {
      entries.push({
        ...parsed,
        name: parsed.name || name || "TOTP",
        notes: "",
        favorite: false,
        host: "",
        tags: [],
      });
      continue;
    }
    const draft = draftFromParts({
      name: name || "TOTP",
      issuer: "",
      secret: totp,
      algorithm: "SHA1",
      digits: DEFAULT_AUTHENTICATOR_DIGITS,
      period: DEFAULT_AUTHENTICATOR_PERIOD,
      notes: "",
      favorite: false,
      kind: AuthenticatorKinds.Totp,
      counter: 0,
    });
    if (decodeBase32(draft.secret)) {
      entries.push(draft);
    }
  }
  return { format: "bitwarden-csv", entries, encrypted: false };
}

function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          cell += '"';
          index++;
        } else {
          quoted = false;
        }
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }
  if (cell || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function draftFromParts(parts: {
  name: string;
  issuer: string;
  secret: string;
  algorithm: string;
  digits: number;
  period: number;
  notes: string;
  favorite: boolean;
  kind: AuthenticatorKind;
  counter: number;
}): ImportedAuthenticator {
  const secret = parts.secret.replace(/\s+/g, "").toUpperCase();
  const algorithm =
    parts.algorithm.toUpperCase() === AuthenticatorAlgorithms.Sha256
      ? AuthenticatorAlgorithms.Sha256
      : parts.algorithm.toUpperCase() === AuthenticatorAlgorithms.Sha512
        ? AuthenticatorAlgorithms.Sha512
        : AuthenticatorAlgorithms.Sha1;
  const meta = defaultAuthenticatorMeta();
  return {
    name: parts.name.trim() || parts.issuer.trim() || "TOTP",
    issuer: parts.issuer.trim(),
    secret,
    algorithm,
    digits: parts.digits,
    period: parts.kind === AuthenticatorKinds.Steam ? 30 : parts.period,
    notes: parts.notes,
    favorite: parts.favorite,
    kind: parts.kind,
    host: meta.host,
    tags: meta.tags,
    counter: parts.kind === AuthenticatorKinds.Hotp ? parts.counter : 0,
  };
}

function kindOr(value: unknown, fallback: AuthenticatorKind): AuthenticatorKind {
  if (value === AuthenticatorKinds.Hotp || value === AuthenticatorKinds.Steam) {
    return value;
  }
  return fallback;
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function numberOr(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function decodeUtf8(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

function decodeBase64(input: string): Uint8Array | null {
  try {
    const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  } catch {
    return null;
  }
}

function walkProtobuf(
  bytes: Uint8Array,
  visit: (field: number, wire: number, value: Uint8Array | number) => void,
): void {
  let offset = 0;
  while (offset < bytes.length) {
    const tag = readVarint(bytes, offset);
    if (tag == null) {
      return;
    }
    offset = tag.offset;
    const field = tag.value >>> 3;
    const wire = tag.value & 7;
    if (wire === 0) {
      const value = readVarint(bytes, offset);
      if (value == null) {
        return;
      }
      offset = value.offset;
      visit(field, wire, value.value);
    } else if (wire === 2) {
      const length = readVarint(bytes, offset);
      if (length == null) {
        return;
      }
      offset = length.offset;
      const end = offset + length.value;
      if (end > bytes.length) {
        return;
      }
      visit(field, wire, bytes.slice(offset, end));
      offset = end;
    } else if (wire === 1) {
      offset += 8;
    } else if (wire === 5) {
      offset += 4;
    } else {
      return;
    }
  }
}

function readVarint(bytes: Uint8Array, offset: number): { value: number; offset: number } | null {
  let value = 0;
  let shift = 0;
  let pos = offset;
  while (pos < bytes.length && shift <= 28) {
    const byte = bytes[pos++];
    value += (byte & 0x7f) * 2 ** shift;
    if ((byte & 0x80) === 0) {
      return { value, offset: pos };
    }
    shift += 7;
  }
  return null;
}

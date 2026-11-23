export const AuthenticatorKinds = Object.freeze({
  Totp: "totp",
  Hotp: "hotp",
  Steam: "steam",
} as const);

export type AuthenticatorKind = (typeof AuthenticatorKinds)[keyof typeof AuthenticatorKinds];

/** Extra fields stored in the encrypted notes so they round-trip without a server schema change. */
export type AuthenticatorMeta = {
  kind: AuthenticatorKind;
  host: string;
  tags: string[];
  counter: number;
};

const SENTINEL = "[[bwmeta:1]]";

export function defaultAuthenticatorMeta(): AuthenticatorMeta {
  return { kind: AuthenticatorKinds.Totp, host: "", tags: [], counter: 0 };
}

export function parseTagList(value: string): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const part of value.split(/[,，]/)) {
    const tag = part.trim();
    const key = tag.toLowerCase();
    if (!tag || seen.has(key)) {
      continue;
    }
    seen.add(key);
    tags.push(tag);
  }
  return tags;
}

/**
 * A 5-digit TOTP must keep an explicit trailer. Older Steam entries used digits === 5
 * with no trailer, and a missing trailer is still read as Steam.
 */
export function shouldPersistMeta(meta: AuthenticatorMeta, digits: number): boolean {
  return (
    meta.kind !== AuthenticatorKinds.Totp ||
    digits === 5 ||
    meta.host !== "" ||
    meta.tags.length > 0 ||
    meta.counter > 0
  );
}

export function splitAuthenticatorNotes(notes: string): {
  text: string;
  meta: AuthenticatorMeta;
  hasTrailer: boolean;
} {
  const index = notes.indexOf(SENTINEL);
  if (index < 0) {
    return { text: notes, meta: defaultAuthenticatorMeta(), hasTrailer: false };
  }
  const text = notes.slice(0, index).trim();
  try {
    const parsed = JSON.parse(notes.slice(index + SENTINEL.length)) as unknown;
    return { text, meta: sanitizeMeta(parsed), hasTrailer: true };
  } catch {
    return { text: notes, meta: defaultAuthenticatorMeta(), hasTrailer: false };
  }
}

export function joinAuthenticatorNotes(
  text: string,
  meta: AuthenticatorMeta,
  digits: number,
): string {
  const body = text.trim();
  if (!shouldPersistMeta(meta, digits)) {
    return body;
  }
  const trailer = `${SENTINEL}${JSON.stringify(compactMeta(meta))}`;
  return body ? `${body}\n${trailer}` : trailer;
}

/** Digits === 5 with no trailer is the Steam entry this form used to save. */
export function kindFromStored(
  meta: AuthenticatorMeta,
  hasTrailer: boolean,
  digits: number,
): AuthenticatorKind {
  if (!hasTrailer && digits === 5) {
    return AuthenticatorKinds.Steam;
  }
  return meta.kind;
}

function compactMeta(meta: AuthenticatorMeta): Record<string, unknown> {
  const compact: Record<string, unknown> = {};
  if (meta.kind !== AuthenticatorKinds.Totp) {
    compact.kind = meta.kind;
  }
  if (meta.host) {
    compact.host = meta.host;
  }
  if (meta.tags.length > 0) {
    compact.tags = meta.tags;
  }
  if (meta.counter > 0) {
    compact.counter = meta.counter;
  }
  return compact;
}

function sanitizeMeta(value: unknown): AuthenticatorMeta {
  const meta = defaultAuthenticatorMeta();
  if (value == null || typeof value !== "object") {
    return meta;
  }
  const record = value as Record<string, unknown>;
  if (record.kind === AuthenticatorKinds.Hotp || record.kind === AuthenticatorKinds.Steam) {
    meta.kind = record.kind;
  }
  if (typeof record.host === "string") {
    meta.host = record.host.trim().toLowerCase();
  }
  if (Array.isArray(record.tags)) {
    meta.tags = parseTagList(record.tags.filter((tag) => typeof tag === "string").join(","));
  }
  if (typeof record.counter === "number" && Number.isInteger(record.counter) && record.counter > 0) {
    meta.counter = record.counter;
  }
  return meta;
}

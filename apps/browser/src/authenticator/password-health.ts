const COMMON_PASSWORDS = new Set([
  "password",
  "123456",
  "12345678",
  "123456789",
  "qwerty",
  "abc123",
  "admin",
  "admin123",
  "111111",
  "000000",
  "iloveyou",
  "123123",
  "654321",
  "1q2w3e4r",
  "passw0rd",
  "password1",
]);

export type PasswordHealthInput = {
  id: string;
  name: string;
  username: string;
  password: string;
};

export type PasswordHealthRow = {
  id: string;
  name: string;
  username: string;
  weak: boolean;
  reused: boolean;
  exposedCount: number | null;
};

export function isWeakPassword(password: string): boolean {
  if (!password) {
    return false;
  }
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    return true;
  }
  if (password.length < 8) {
    return true;
  }
  if (password.length >= 12) {
    return false;
  }
  let classes = 0;
  if (/[a-z]/.test(password)) {
    classes++;
  }
  if (/[A-Z]/.test(password)) {
    classes++;
  }
  if (/[0-9]/.test(password)) {
    classes++;
  }
  if (/[^A-Za-z0-9]/.test(password)) {
    classes++;
  }
  return classes < 3;
}

export function classifyPasswords(items: PasswordHealthInput[]): PasswordHealthRow[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    if (!item.password) {
      continue;
    }
    counts.set(item.password, (counts.get(item.password) ?? 0) + 1);
  }
  return items
    .filter((item) => item.password)
    .map((item) => ({
      id: item.id,
      name: item.name || item.username || "登录",
      username: item.username,
      weak: isWeakPassword(item.password),
      reused: (counts.get(item.password) ?? 0) > 1,
      exposedCount: null,
    }));
}

export async function sha1Hex(password: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(password));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

/** Parses a Pwned Passwords range body. Only the hash suffix is compared locally. */
export function exposedCountFromRange(body: string, hashEnding: string): number {
  const match = new RegExp(`^${hashEnding}:(\\d+)`, "im").exec(body);
  return match ? Number(match[1]) : 0;
}

export type RangeFetcher = (prefix: string) => Promise<string>;

/**
 * k-anonymity lookup. The password never leaves the client; the request is the first
 * five characters of its SHA-1.
 */
export async function lookupExposedCounts(
  passwords: string[],
  fetchRange: RangeFetcher,
): Promise<Map<string, number>> {
  const unique = [...new Set(passwords.filter((password) => password))];
  const counts = new Map<string, number>();
  const ranges = new Map<string, Promise<string>>();
  for (const password of unique) {
    const hash = await sha1Hex(password);
    const prefix = hash.slice(0, 5);
    const ending = hash.slice(5);
    let pending = ranges.get(prefix);
    if (pending == null) {
      pending = fetchRange(prefix);
      ranges.set(prefix, pending);
    }
    const body = await pending;
    counts.set(password, exposedCountFromRange(body, ending));
  }
  return counts;
}

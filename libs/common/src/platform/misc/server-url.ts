export type ServerUrlVerdict =
  | { status: "ok"; base: string }
  | { status: "empty" | "invalid" | "https" };

/**
 * Loopback names this fork allows over HTTP. Official clients reject every
 * non-HTTPS URL outside dev builds. A local vaultwarden is commonly
 * `http://localhost` or `http://127.0.0.1`, so those stay allowed. Any other
 * host still has to use HTTPS.
 */
export function isLoopbackHostname(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase();
  return (
    host === "localhost" || host.endsWith(".localhost") || host === "127.0.0.1" || host === "::1"
  );
}

/** True when a request URL is HTTPS, or HTTP to a loopback host. */
export function isAllowedServerRequestUrl(url: string): boolean {
  if (url.startsWith("https://")) {
    return true;
  }
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" && isLoopbackHostname(parsed.hostname);
  } catch {
    return false;
  }
}

/**
 * Normalizes the login form's server field. A missing scheme becomes https://.
 * HTTP is accepted only for loopback hosts.
 */
export function describeServerUrl(rawInput: string): ServerUrlVerdict {
  const raw = rawInput.trim();
  if (!raw) {
    return { status: "empty" };
  }
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    return { status: "invalid" };
  }
  if (parsed.username !== "" || parsed.password !== "") {
    return { status: "invalid" };
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return { status: "invalid" };
  }
  if (parsed.protocol === "http:" && !isLoopbackHostname(parsed.hostname)) {
    return { status: "https" };
  }
  if (parsed.hostname === "") {
    return { status: "invalid" };
  }
  return { status: "ok", base: parsed.origin };
}

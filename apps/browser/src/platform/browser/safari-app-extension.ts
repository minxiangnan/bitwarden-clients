/**
 * True only in the Safari app-extension build (`BROWSER=safari`).
 *
 * This is a compile-time flag, not the user agent. Chromium builds whose UA
 * omits "Chrome/" (headless Chrome, UA overrides) still contain "Safari/" and
 * must not be treated as Safari.
 */
export function isSafariAppExtension(): boolean {
  return process.env.BROWSER === "safari";
}

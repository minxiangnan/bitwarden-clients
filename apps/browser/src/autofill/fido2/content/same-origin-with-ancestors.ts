/**
 * WebAuthn's `sameOriginWithAncestors`: true when this window and every ancestor
 * browsing context share one origin. A same-origin iframe is allowed. Any
 * cross-origin ancestor is not — reading that ancestor's location throws.
 */
export function isSameOriginWithAncestors(win: Window): boolean {
  try {
    const top = win.top;
    if (top == null) {
      return false;
    }

    let current = win;
    while (current !== top) {
      const parent = current.parent;
      if (parent == null || parent === current) {
        return false;
      }
      if (current.location.origin !== parent.location.origin) {
        return false;
      }
      current = parent;
    }
    return true;
  } catch {
    return false;
  }
}

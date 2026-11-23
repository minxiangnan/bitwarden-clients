/**
 * True when this document can use a same-origin relying party: it is the top
 * window, or every ancestor is the same origin. Reading a cross-origin
 * ancestor's location throws, which means the chain is not same-origin.
 */
export function isSameOriginWithAncestors(win: Window): boolean {
  try {
    let current = win;
    while (current.parent !== current) {
      if (current.location.origin !== current.parent.location.origin) {
        return false;
      }
      current = current.parent;
    }
    return true;
  } catch {
    return false;
  }
}

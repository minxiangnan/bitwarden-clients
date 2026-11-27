import { formatTotpOrder } from "@bitwarden/common/vault/utils/totp-order-field";

import { compareAuthenticatorEntries } from "./authenticator-otpauth";
import { AuthenticatorEntryView } from "./authenticator.models";

/** Gap between newly numbered rows. Midpoints (1500, 1250) fit between them. */
export const TOTP_ORDER_STEP = 1000;

/**
 * Below this gap a midpoint collapses onto a neighbor, so the whole visible
 * list is rewritten as 1000, 2000, 3000.
 */
export const TOTP_ORDER_MIN_GAP = 0.001;

export type TotpOrderIndex = {
  orderBySecret: ReadonlyMap<string, number>;
  secretsWithCipher: ReadonlySet<string>;
};

export type TotpOrderWrite = {
  secret: string;
  order: number;
};

export function applyTotpOrderWrites(
  index: TotpOrderIndex,
  writes: readonly TotpOrderWrite[],
): TotpOrderIndex {
  const orderBySecret = new Map(index.orderBySecret);
  const secretsWithCipher = new Set(index.secretsWithCipher);
  for (const write of writes) {
    const secret = secretKey(write.secret);
    orderBySecret.set(secret, write.order);
    secretsWithCipher.add(secret);
  }
  return { orderBySecret, secretsWithCipher };
}

export function secretKey(secret: string): string {
  return secret.replace(/\s+/g, "").toUpperCase();
}

/**
 * Rows that have `zh.totp.order` come first, ascending. Rows without it keep
 * the current sort (sortOrder, then name). Favorites are not a key.
 */
export function compareByTotpOrder(
  a: AuthenticatorEntryView,
  b: AuthenticatorEntryView,
  orders: ReadonlyMap<string, number>,
): number {
  const aOrder = orders.get(secretKey(a.secret)) ?? null;
  const bOrder = orders.get(secretKey(b.secret)) ?? null;
  const aHas = aOrder != null;
  const bHas = bOrder != null;
  if (aHas !== bHas) {
    return aHas ? -1 : 1;
  }
  if (aHas && bHas && aOrder !== bOrder) {
    return aOrder - bOrder;
  }
  return compareAuthenticatorEntries(a, b);
}

/**
 * Order values to persist after a row lands at `destinationIndex` in `entries`
 * (the index in the list that still contains the moved row).
 * Returns null when the moved row has no login cipher to store the field on.
 * One write is the midpoint of the neighbors. The whole list is numbered only
 * when that midpoint would collapse, or when neither neighbor has a number
 * (a single new number cannot sit between two unnumbered rows).
 */
export function placementAfterMove(
  entries: AuthenticatorEntryView[],
  movedId: string,
  destinationIndex: number,
  index: TotpOrderIndex,
): TotpOrderWrite[] | null {
  const from = entries.findIndex((entry) => entry.id === movedId);
  const moved = from >= 0 ? entries[from] : undefined;
  if (moved == null || moved.undecryptable) {
    return null;
  }
  const movedSecret = secretKey(moved.secret);
  if (!index.secretsWithCipher.has(movedSecret)) {
    return null;
  }
  if (from === destinationIndex) {
    return [];
  }
  const without = entries.filter((entry) => entry.id !== movedId);
  const at = Math.max(0, Math.min(destinationIndex, without.length));
  const final = [...without.slice(0, at), moved, ...without.slice(at)];
  const prev = at > 0 ? final[at - 1] : undefined;
  const next = final[at + 1];
  const prevOrder = orderOf(prev, index);
  const nextOrder = orderOf(next, index);
  const decision = nextOrderValue(prevOrder, nextOrder);
  if (!decision.renumber) {
    return [{ secret: movedSecret, order: decision.value }];
  }
  const writable = final.filter((entry) => index.secretsWithCipher.has(secretKey(entry.secret)));
  return writable.map((entry, position) => ({
    secret: secretKey(entry.secret),
    order: (position + 1) * TOTP_ORDER_STEP,
  }));
}

function orderOf(entry: AuthenticatorEntryView | undefined, index: TotpOrderIndex): number | null {
  if (entry == null) {
    return null;
  }
  return index.orderBySecret.get(secretKey(entry.secret)) ?? null;
}

function nextOrderValue(
  prev: number | null,
  next: number | null,
): { value: number; renumber: boolean } {
  if (prev == null && next == null) {
    return { value: TOTP_ORDER_STEP, renumber: true };
  }
  if (prev == null && next != null) {
    return { value: next - TOTP_ORDER_STEP, renumber: false };
  }
  if (prev != null && next == null) {
    return { value: prev + TOTP_ORDER_STEP, renumber: false };
  }
  const gap = (next as number) - (prev as number);
  const mid = (prev as number) + gap / 2;
  if (!(gap > TOTP_ORDER_MIN_GAP)) {
    return { value: mid, renumber: true };
  }
  const formatted = formatTotpOrder(mid);
  if (
    formatted === formatTotpOrder(prev as number) ||
    formatted === formatTotpOrder(next as number)
  ) {
    return { value: mid, renumber: true };
  }
  return { value: mid, renumber: false };
}

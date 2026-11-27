import { FieldType } from "@bitwarden/common/vault/enums/field-type.enum";
import { FieldView } from "@bitwarden/common/vault/models/view/field.view";
import {
  formatTotpOrder,
  parseTotpOrder,
  replaceTotpOrderField,
  TOTP_ORDER_FIELD,
  withoutTotpOrderFields,
} from "@bitwarden/common/vault/utils/totp-order-field";

import { AuthenticatorEntryView } from "./authenticator.models";
import { compareByTotpOrder, placementAfterMove, TotpOrderIndex } from "./totp-order";

function row(
  id: string,
  secret: string,
  sortOrder: number,
  extra: Partial<AuthenticatorEntryView> = {},
): AuthenticatorEntryView {
  return {
    id,
    name: id,
    issuer: "",
    secret,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    notes: "",
    favorite: false,
    sortOrder,
    revisionDate: "",
    creationDate: "",
    undecryptable: false,
    ...extra,
  };
}

function index(orders: Record<string, number>, secrets: string[]): TotpOrderIndex {
  return {
    orderBySecret: new Map(Object.entries(orders)),
    secretsWithCipher: new Set(secrets),
  };
}

describe("totp order", () => {
  const ada = "WQIQ25BRKZYCJVYP";
  const bea = "BEASECRETSECRET";
  const cy = "CYSECRETSECRET1";

  it("parses a decimal order and ignores anything else", () => {
    expect(parseTotpOrder("1500")).toBe(1500);
    expect(parseTotpOrder(" 1250.5 ")).toBe(1250.5);
    expect(parseTotpOrder("1e3")).toBeNull();
    expect(formatTotpOrder(1500)).toBe("1500");
    expect(formatTotpOrder(1250.5)).toBe("1250.5");
  });

  it("keeps the order field out of the editable list and puts it back on save", () => {
    const note = new FieldView();
    note.type = FieldType.Text;
    note.name = "note";
    note.value = "hi";
    const order = new FieldView();
    order.type = FieldType.Hidden;
    order.name = TOTP_ORDER_FIELD;
    order.value = "1000";

    const split = withoutTotpOrderFields([note, order]);

    expect(split.editable.map((field) => field.name)).toEqual(["note"]);
    expect(split.system.map((field) => field.name)).toEqual([TOTP_ORDER_FIELD]);
    expect(replaceTotpOrderField([note, order], 1500).map((field) => field.value)).toEqual([
      "hi",
      "1500",
    ]);
  });

  it("sorts numbered rows first and leaves the rest on the current sort", () => {
    const numbered = row("c", cy, 9);
    const later = row("a", ada, 2);
    const earlier = row("b", bea, 1, { favorite: true });
    const orders = new Map([[cy, 500]]);
    const sorted = [later, numbered, earlier].sort((a, b) => compareByTotpOrder(a, b, orders));

    expect(sorted.map((entry) => entry.id)).toEqual(["c", "b", "a"]);
  });

  it("does not pin a favorite when neither row has an order", () => {
    const favorite = row("a", ada, 2, { favorite: true, name: "Ada" });
    const other = row("b", bea, 1, { name: "Bea" });

    expect(compareByTotpOrder(favorite, other, new Map())).toBeGreaterThan(0);
  });

  it("writes only the moved row when the neighbors have room between them", () => {
    const entries = [row("a", ada, 1), row("b", bea, 2), row("c", cy, 3)];
    const writes = placementAfterMove(
      entries,
      "c",
      1,
      index({ [ada]: 1000, [bea]: 2000, [cy]: 3000 }, [ada, bea, cy]),
    );

    expect(writes).toEqual([{ secret: cy, order: 1500 }]);
  });

  it("places a row at the top by stepping back from the next order", () => {
    const entries = [row("a", ada, 1), row("b", bea, 2)];
    const writes = placementAfterMove(
      entries,
      "b",
      0,
      index({ [ada]: 1000, [bea]: 2000 }, [ada, bea]),
    );

    expect(writes).toEqual([{ secret: bea, order: 0 }]);
  });

  it("renumbers when the gap is too small to fit a midpoint", () => {
    const entries = [row("a", ada, 1), row("b", bea, 2), row("c", cy, 3)];
    const writes = placementAfterMove(
      entries,
      "c",
      1,
      index({ [ada]: 1000, [bea]: 1000.0005, [cy]: 3000 }, [ada, bea, cy]),
    );

    expect(writes).toEqual([
      { secret: ada, order: 1000 },
      { secret: cy, order: 2000 },
      { secret: bea, order: 3000 },
    ]);
  });

  it("renumbers when neither neighbor has a number, so the row can sit between them", () => {
    const entries = [row("a", ada, 1), row("b", bea, 2)];
    const writes = placementAfterMove(entries, "b", 0, index({}, [ada, bea]));

    expect(writes).toEqual([
      { secret: bea, order: 1000 },
      { secret: ada, order: 2000 },
    ]);
  });

  it("refuses a row that has no login cipher", () => {
    const entries = [row("a", ada, 1), row("b", bea, 2)];

    expect(placementAfterMove(entries, "b", 0, index({ [ada]: 1000 }, [ada]))).toBeNull();
  });
});

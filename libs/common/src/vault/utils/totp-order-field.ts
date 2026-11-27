import { FieldType } from "../enums/field-type.enum";
import { FieldView } from "../models/view/field.view";

/** Hidden custom field shared with the Android authenticator list. */
export const TOTP_ORDER_FIELD = "zh.totp.order";

export function isTotpOrderField(field: { type: FieldType; name?: string | null }): boolean {
  return field.type === FieldType.Hidden && field.name === TOTP_ORDER_FIELD;
}

/** Decimal string, or null when the field is missing or not a finite number. */
export function parseTotpOrder(value: string | null | undefined): number | null {
  if (value == null) {
    return null;
  }
  const trimmed = String(value).trim();
  if (!/^-?(?:\d+\.?\d*|\.\d+)$/.test(trimmed)) {
    return null;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Decimal string without scientific notation. Trailing zeros are dropped. */
export function formatTotpOrder(value: number): string {
  if (!Number.isFinite(value)) {
    return "1000";
  }
  const rounded = Math.round(value * 1e6) / 1e6;
  return String(rounded);
}

export function readTotpOrder(
  fields: { type: FieldType; name?: string | null; value?: string | null }[] | null | undefined,
): number | null {
  const field = fields?.find((item) => isTotpOrderField(item));
  return parseTotpOrder(field?.value);
}

/** Splits the system order field out of the fields a person can edit or delete. */
export function withoutTotpOrderFields(fields: FieldView[] | null | undefined): {
  editable: FieldView[];
  system: FieldView[];
} {
  const editable: FieldView[] = [];
  const system: FieldView[] = [];
  for (const field of fields ?? []) {
    if (isTotpOrderField(field)) {
      system.push(field);
      continue;
    }
    editable.push(field);
  }
  return { editable, system };
}

/** Replaces any existing order field and leaves the other fields in place. */
export function replaceTotpOrderField(
  fields: FieldView[] | null | undefined,
  order: number,
): FieldView[] {
  const kept = (fields ?? []).filter((field) => !isTotpOrderField(field));
  const field = new FieldView();
  field.type = FieldType.Hidden;
  field.name = TOTP_ORDER_FIELD;
  field.value = formatTotpOrder(order);
  kept.push(field);
  return kept;
}

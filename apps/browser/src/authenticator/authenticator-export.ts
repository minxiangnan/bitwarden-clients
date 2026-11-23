import { entryKind } from "./authenticator-codes";
import { toOtpAuthUri } from "./authenticator-otpauth";
import { AuthenticatorEntryView } from "./authenticator.models";

export type AuthenticatorExportDocument = {
  encrypted: false;
  format: "zh-authenticator";
  warning: string;
  items: Array<{
    otpauth: string;
    kind: string;
    host: string;
    tags: string[];
    counter: number;
    notes: string;
    favorite: boolean;
    name: string;
    issuer: string;
  }>;
};

export const AUTHENTICATOR_EXPORT_WARNING =
  "此文件包含明文密钥，只适合迁移。加密副本在你的服务器上。";

/** Plain migration file. The encrypted copy is the vault entry, not this download. */
export function buildAuthenticatorExport(
  entries: AuthenticatorEntryView[],
): AuthenticatorExportDocument {
  return {
    encrypted: false,
    format: "zh-authenticator",
    warning: AUTHENTICATOR_EXPORT_WARNING,
    items: entries
      .filter((entry) => !entry.undecryptable && entry.secret)
      .map((entry) => ({
        otpauth: toOtpAuthUri(entry),
        kind: entryKind(entry),
        host: entry.host ?? "",
        tags: entry.tags ?? [],
        counter: entry.counter ?? 0,
        notes: entry.notes,
        favorite: entry.favorite,
        name: entry.name,
        issuer: entry.issuer,
      })),
  };
}

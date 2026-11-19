import { Jsonify } from "type-fest";

import { CIPHERS_MEMORY, UserKeyDefinition } from "../../../platform/state";
import { AuthenticatorEntryResponse } from "../../models/response/authenticator-entry.response";

/**
 * Ciphertext authenticator entries from the latest sync, shared by the background
 * sync and the popup. `unsupported` means GET /authenticator returned 404.
 * Absent state means this server has not reported the field yet, so the popup
 * falls back to GET.
 */
export type AuthenticatorSyncSnapshot = {
  source: "sync" | "unsupported";
  entries: AuthenticatorEntryResponse[];
};

export const AUTHENTICATOR_SYNC_SNAPSHOT = new UserKeyDefinition<AuthenticatorSyncSnapshot>(
  CIPHERS_MEMORY,
  "authenticatorSyncSnapshot",
  {
    deserializer: (snapshot: Jsonify<AuthenticatorSyncSnapshot>) => ({
      source: snapshot.source === "unsupported" ? "unsupported" : "sync",
      entries: (snapshot.entries ?? []).map((entry) => new AuthenticatorEntryResponse(entry)),
    }),
    clearOn: ["logout", "lock"],
  },
);

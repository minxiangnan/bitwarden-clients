import { Jsonify } from "type-fest";

import { CIPHERS_DISK, UserKeyDefinition } from "../../../platform/state";
import { AuthenticatorEntryResponse } from "../../models/response/authenticator-entry.response";

/**
 * Ciphertext authenticator entries from the latest sync, shared by the background
 * sync and the popup. `unsupported` means GET /authenticator returned 404.
 * Absent state means this server has not reported the field yet, so the popup
 * falls back to GET.
 *
 * Disk, cleared on logout only: the values are already user-key ciphertext, same as
 * login ciphers, so an unlock without a network can still show the last codes.
 */
export type AuthenticatorSyncSnapshot = {
  source: "sync" | "unsupported";
  entries: AuthenticatorEntryResponse[];
  syncedAt?: string | null;
};

export const AUTHENTICATOR_SYNC_SNAPSHOT = new UserKeyDefinition<AuthenticatorSyncSnapshot>(
  CIPHERS_DISK,
  "authenticatorSyncSnapshot",
  {
    deserializer: (snapshot: Jsonify<AuthenticatorSyncSnapshot> | null) => {
      if (snapshot == null) {
        return null;
      }
      return {
        source: snapshot.source === "unsupported" ? "unsupported" : "sync",
        entries: (snapshot.entries ?? []).map((entry) => new AuthenticatorEntryResponse(entry)),
        syncedAt: typeof snapshot.syncedAt === "string" ? snapshot.syncedAt : null,
      };
    },
    clearOn: ["logout"],
  },
);

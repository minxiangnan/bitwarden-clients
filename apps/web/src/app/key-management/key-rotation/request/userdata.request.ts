import { SendWithIdRequest } from "@bitwarden/common/tools/send/models/request/send-with-id.request";
import { CipherWithIdRequest } from "@bitwarden/common/vault/models/request/cipher-with-id.request";
import { FolderWithIdRequest } from "@bitwarden/common/vault/models/request/folder-with-id.request";

import { AuthenticatorRotationRequest } from "../authenticator-key-rotation";

export class UserDataRequest {
  ciphers: CipherWithIdRequest[];
  folders: FolderWithIdRequest[];
  sends: SendWithIdRequest[];
  /**
   * Omitted on servers without the authenticator API (official Bitwarden).
   * Present, including `[]`, when the server returned GET /authenticator.
   */
  authenticatorEntries?: AuthenticatorRotationRequest[];

  constructor(
    ciphers: CipherWithIdRequest[],
    folders: FolderWithIdRequest[],
    sends: SendWithIdRequest[],
    authenticatorEntries?: AuthenticatorRotationRequest[],
  ) {
    this.ciphers = ciphers;
    this.folders = folders;
    this.sends = sends;
    if (authenticatorEntries !== undefined) {
      this.authenticatorEntries = authenticatorEntries;
    }
  }
}

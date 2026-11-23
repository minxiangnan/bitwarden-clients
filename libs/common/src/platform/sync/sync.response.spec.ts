import { SyncResponse } from "./sync.response";

describe("SyncResponse", () => {
  it("should create response when user decryption is not provided", () => {
    const response = new SyncResponse({
      UserDecryption: undefined,
    });
    expect(response.userDecryption).toBeUndefined();
  });

  it("should create response when user decryption is provided", () => {
    const response = new SyncResponse({
      UserDecryption: {},
    });
    expect(response.userDecryption).toBeDefined();
    expect(response.userDecryption!.masterPasswordUnlock).toBeUndefined();
  });

  it("leaves authenticator entries unset when the server omits the field", () => {
    const response = new SyncResponse({ Profile: {} });
    expect(response.authenticatorEntries).toBeUndefined();
  });

  it("parses authenticator entries from the sync response", () => {
    const response = new SyncResponse({
      authenticatorEntries: [
        {
          id: "entry-1",
          name: "enc-name",
          issuer: null,
          secret: "enc-secret",
          algorithm: "SHA256",
          digits: 8,
          period: 60,
          notes: "enc-notes",
          favorite: true,
          sortOrder: -2,
          revisionDate: "2026-11-15T00:00:00.000Z",
          creationDate: "2026-11-15T00:00:01.000Z",
          object: "authenticatorEntry",
        },
      ],
    });

    expect(response.authenticatorEntries).toEqual([
      expect.objectContaining({
        id: "entry-1",
        name: "enc-name",
        issuer: null,
        secret: "enc-secret",
        algorithm: "SHA256",
        digits: 8,
        period: 60,
        notes: "enc-notes",
        favorite: true,
        sortOrder: -2,
        revisionDate: "2026-11-15T00:00:00.000Z",
        creationDate: "2026-11-15T00:00:01.000Z",
        object: "authenticatorEntry",
      }),
    ]);
  });

  it("treats an empty authenticator array as present", () => {
    const response = new SyncResponse({ AuthenticatorEntries: [] });
    expect(response.authenticatorEntries).toEqual([]);
  });
});

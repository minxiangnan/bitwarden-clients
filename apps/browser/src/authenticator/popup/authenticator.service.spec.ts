import { mock } from "jest-mock-extended";
import { BehaviorSubject, of } from "rxjs";

import { AccountService } from "@bitwarden/common/auth/abstractions/account.service";
import { AuthService } from "@bitwarden/common/auth/abstractions/auth.service";
import { AuthenticationStatus } from "@bitwarden/common/auth/enums/authentication-status";
import { ErrorResponse } from "@bitwarden/common/models/response/error.response";
import { LogService } from "@bitwarden/common/platform/abstractions/log.service";
import { SyncService } from "@bitwarden/common/platform/sync";
import { UserId } from "@bitwarden/common/types/guid";
import { CipherService } from "@bitwarden/common/vault/abstractions/cipher.service";
import { KeyService } from "@bitwarden/key-management";
// eslint-disable-next-line no-restricted-imports
import { EncString, EncryptService } from "@bitwarden/legacy-crypto";

import { AuthenticatorApiService } from "./authenticator-api.service";
import { AuthenticatorService, draftFromCipher } from "./authenticator.service";

describe("AuthenticatorService", () => {
  const userId = "user-1" as UserId;
  const api = mock<AuthenticatorApiService>();
  const accountService = mock<AccountService>();
  const authService = mock<AuthService>();
  const keyService = mock<KeyService>();
  const encryptService = mock<EncryptService>();
  const syncService = mock<SyncService>();
  const cipherService = mock<CipherService>();
  const logService = mock<LogService>();
  const status$ = new BehaviorSubject(AuthenticationStatus.LoggedOut);

  function createService() {
    accountService.activeAccount$ = of({ id: userId } as never);
    authService.activeAccountStatus$ = status$;
    syncService.activeUserLastSync$.mockReturnValue(of(null));
    keyService.userKey$.mockReturnValue(of("user-key" as never));
    encryptService.encryptString.mockImplementation(async (value: string) => {
      return { toJSON: () => `enc:${value}` } as EncString;
    });
    encryptService.decryptString.mockImplementation(async (value: EncString) =>
      String(value.toJSON()).replace(/^enc:/, ""),
    );
    return new AuthenticatorService(
      api,
      accountService,
      authService,
      keyService,
      encryptService,
      syncService,
      cipherService,
      logService,
    );
  }

  beforeEach(() => {
    jest.resetAllMocks();
    status$.next(AuthenticationStatus.LoggedOut);
  });

  it("hides the feature when the server returns 404", async () => {
    api.list.mockRejectedValue(new ErrorResponse({}, 404));
    const service = createService();

    await service.refresh(userId);

    expect(service["stateSubject"].value.status).toBe("unsupported");
    expect(service["stateSubject"].value.entries).toEqual([]);
  });

  it("encrypts name, issuer, secret, and notes before saving", async () => {
    api.list.mockResolvedValue([]);
    api.create.mockResolvedValue({
      id: "1",
      name: "enc:Ada",
      issuer: "enc:Example",
      secret: "enc:WQIQ25BRKZYCJVYP",
      notes: "enc:desk",
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      favorite: false,
      sortOrder: 1,
      revisionDate: "",
      creationDate: "",
      object: "authenticatorEntry",
    } as never);
    const service = createService();

    await service.save({
      name: "Ada",
      issuer: "Example",
      secret: "wqiq 25br kzyc jvyp",
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      notes: "desk",
      favorite: false,
    });

    expect(api.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "enc:Ada",
        issuer: "enc:Example",
        secret: "enc:WQIQ25BRKZYCJVYP",
        notes: "enc:desk",
        algorithm: "SHA1",
        digits: 6,
        period: 30,
      }),
    );
  });

  it("decrypts listed entries with the user key", async () => {
    api.list.mockResolvedValue([
      {
        id: "1",
        name: "enc:Ada",
        issuer: null,
        secret: "enc:WQIQ25BRKZYCJVYP",
        notes: null,
        algorithm: "SHA256",
        digits: 8,
        period: 45,
        favorite: true,
        sortOrder: 2,
        revisionDate: "2026-01-01",
        creationDate: "2026-01-01",
        object: "authenticatorEntry",
      } as never,
    ]);
    const service = createService();

    await service.refresh(userId);

    expect(service["stateSubject"].value.entries[0]).toEqual(
      expect.objectContaining({
        id: "1",
        name: "Ada",
        issuer: "",
        secret: "WQIQ25BRKZYCJVYP",
        algorithm: "SHA256",
        digits: 8,
        period: 45,
        favorite: true,
      }),
    );
  });

  it("reads a raw vault TOTP secret into an import draft", () => {
    const draft = draftFromCipher({
      id: "c1",
      name: "Mail",
      login: { totp: "wqiq 25br kzyc jvyp", username: "ada" },
    } as never);

    expect(draft).toEqual(
      expect.objectContaining({
        name: "Mail",
        secret: "WQIQ25BRKZYCJVYP",
        algorithm: "SHA1",
        digits: 6,
        period: 30,
      }),
    );
  });
});

import { mock } from "jest-mock-extended";
import { BehaviorSubject, filter, firstValueFrom, of } from "rxjs";

import { AccountService } from "@bitwarden/common/auth/abstractions/account.service";
import { AuthService } from "@bitwarden/common/auth/abstractions/auth.service";
import { AuthenticationStatus } from "@bitwarden/common/auth/enums/authentication-status";
import { ErrorResponse } from "@bitwarden/common/models/response/error.response";
import { LogService } from "@bitwarden/common/platform/abstractions/log.service";
import { StateProvider } from "@bitwarden/common/platform/state";
import { UserId } from "@bitwarden/common/types/guid";
import { CipherService } from "@bitwarden/common/vault/abstractions/cipher.service";
import { FieldType } from "@bitwarden/common/vault/enums/field-type.enum";
import { TOTP_ORDER_FIELD } from "@bitwarden/common/vault/utils/totp-order-field";
import { KeyService } from "@bitwarden/key-management";
// eslint-disable-next-line no-restricted-imports
import { EncString, EncryptService } from "@bitwarden/legacy-crypto";

import { AuthenticatorApiService } from "./authenticator-api.service";
import {
  AuthenticatorService,
  draftFromCipher,
  TotpOrderCipherMissingError,
} from "./authenticator.service";

describe("AuthenticatorService", () => {
  const userId = "user-1" as UserId;
  const api = mock<AuthenticatorApiService>();
  const accountService = mock<AccountService>();
  const authService = mock<AuthService>();
  const keyService = mock<KeyService>();
  const encryptService = mock<EncryptService>();
  const cipherService = mock<CipherService>();
  const logService = mock<LogService>();
  const stateProvider = mock<StateProvider>();
  const status$ = new BehaviorSubject(AuthenticationStatus.LoggedOut);
  const snapshot$ = new BehaviorSubject<unknown>(null);

  function createService() {
    accountService.activeAccount$ = of({ id: userId } as never);
    authService.activeAccountStatus$ = status$;
    stateProvider.getUser.mockReturnValue({
      state$: snapshot$,
      update: jest.fn(async (updater: (current: unknown) => unknown) => {
        const next = updater(snapshot$.value);
        snapshot$.next(next);
        return next;
      }),
    } as never);
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
      cipherService,
      logService,
      stateProvider,
    );
  }

  beforeEach(() => {
    jest.resetAllMocks();
    status$.next(AuthenticationStatus.LoggedOut);
    snapshot$.next(null);
  });

  it("hides the feature when the server returns 404", async () => {
    api.list.mockRejectedValue(new ErrorResponse({}, 404));
    const service = createService();

    await service.refresh(userId);

    expect(service["stateSubject"].value.status).toBe("unsupported");
    expect(service["stateSubject"].value.entries).toEqual([]);
    expect(stateProvider.getUser).toHaveBeenCalled();
  });

  it("decrypts the sync snapshot on unlock without GET /authenticator", async () => {
    snapshot$.next({
      source: "sync",
      entries: [
        {
          id: "1",
          name: "enc:Ada",
          issuer: null,
          secret: "enc:WQIQ25BRKZYCJVYP",
          notes: null,
          algorithm: "SHA1",
          digits: 6,
          period: 30,
          favorite: false,
          sortOrder: 0,
          revisionDate: "",
          creationDate: "",
          object: "authenticatorEntry",
        },
      ],
    });
    status$.next(AuthenticationStatus.Unlocked);
    const service = createService();

    const state = await firstValueFrom(
      service.state$.pipe(filter((value) => value.status === "ready")),
    );

    expect(api.list).not.toHaveBeenCalled();
    expect(state.entries[0]).toEqual(
      expect.objectContaining({
        id: "1",
        name: "Ada",
        secret: "WQIQ25BRKZYCJVYP",
        undecryptable: false,
      }),
    );
  });

  it("decrypts a refresh once when writing the snapshot replays it", async () => {
    api.list.mockResolvedValue([
      {
        id: "1",
        name: "enc:Ada",
        issuer: null,
        secret: "enc:SECRET",
        notes: null,
        algorithm: "SHA1",
        digits: 6,
        period: 30,
        favorite: false,
        sortOrder: 0,
        revisionDate: "",
        creationDate: "",
        object: "authenticatorEntry",
      },
    ] as never);
    status$.next(AuthenticationStatus.Unlocked);
    const service = createService();

    await firstValueFrom(service.state$.pipe(filter((value) => value.status === "ready")));

    expect(encryptService.decryptString).toHaveBeenCalledTimes(2);
    expect(service["stateSubject"].value.entries).toHaveLength(1);
  });

  it("drops decrypted entries when the vault locks", async () => {
    snapshot$.next({
      source: "sync",
      entries: [
        {
          id: "1",
          name: "enc:Ada",
          issuer: null,
          secret: "enc:SECRET",
          notes: null,
          algorithm: "SHA1",
          digits: 6,
          period: 30,
          favorite: false,
          sortOrder: 0,
          revisionDate: "",
          creationDate: "",
          object: "authenticatorEntry",
        },
      ],
    });
    status$.next(AuthenticationStatus.Unlocked);
    const service = createService();
    await firstValueFrom(service.state$.pipe(filter((value) => value.status === "ready")));

    status$.next(AuthenticationStatus.Locked);

    expect(service["stateSubject"].value).toEqual({ status: "loading", entries: [] });
  });

  it("marks a failed decrypt and refuses to save over it", async () => {
    api.list.mockResolvedValue([
      {
        id: "1",
        name: "enc:Ada",
        issuer: null,
        secret: "enc:SECRET",
        notes: null,
        algorithm: "SHA1",
        digits: 6,
        period: 30,
        favorite: false,
        sortOrder: 0,
        revisionDate: "",
        creationDate: "",
        object: "authenticatorEntry",
      },
    ] as never);
    const service = createService();
    encryptService.decryptString.mockImplementation(async (value: EncString) => {
      if (value.toJSON() === "enc:SECRET") {
        return null;
      }
      return String(value.toJSON()).replace(/^enc:/, "");
    });

    await service.refresh(userId);

    expect(service["stateSubject"].value.entries[0]).toEqual(
      expect.objectContaining({ undecryptable: true, secret: "", name: "Ada" }),
    );
    await expect(
      service.save(
        {
          name: "Ada",
          issuer: "",
          secret: "WQIQ25BRKZYCJVYP",
          algorithm: "SHA1",
          digits: 6,
          period: 30,
          notes: "",
          favorite: false,
        },
        "1",
      ),
    ).rejects.toThrow(/decrypted/);
    expect(api.update).not.toHaveBeenCalled();
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

  it("swaps sortOrder with the neighbor above", async () => {
    const row = (id: string, name: string, sortOrder: number) =>
      ({
        id,
        name: `enc:${name}`,
        issuer: null,
        secret: "enc:SECRET",
        notes: null,
        algorithm: "SHA1",
        digits: 6,
        period: 30,
        favorite: id === "b",
        sortOrder,
        revisionDate: "",
        creationDate: "",
        object: "authenticatorEntry",
      }) as never;
    api.list.mockResolvedValue([row("b", "Bea", 2), row("a", "Ada", 1)]);
    api.update.mockResolvedValue({} as never);
    const service = createService();

    await service.refresh(userId);
    await service.move("b", -1);

    expect(api.update).toHaveBeenNthCalledWith(
      1,
      "b",
      expect.objectContaining({ sortOrder: 1, favorite: true }),
    );
    expect(api.update).toHaveBeenNthCalledWith(
      2,
      "a",
      expect.objectContaining({ sortOrder: 2, favorite: false }),
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

  it("writes zh.totp.order on the matching cipher and leaves the other cipher alone", async () => {
    const service = createService();
    cipherService.getAllDecrypted.mockResolvedValue([
      { id: "c1", name: "Mail", login: { totp: "WQIQ25BRKZYCJVYP" }, fields: [] },
      { id: "c2", name: "Other", login: { totp: "OTHERSECRET" }, fields: [] },
    ] as never);
    cipherService.get.mockResolvedValue({ id: "c1" } as never);
    cipherService.decrypt.mockResolvedValue({
      id: "c1",
      fields: [{ type: FieldType.Text, name: "note", value: "hi" }],
      login: { totp: "WQIQ25BRKZYCJVYP" },
    } as never);
    cipherService.updateWithServer.mockImplementation(async (view) => view);

    await service.writeTotpOrders([{ secret: "wqiq 25br kzyc jvyp", order: 1500 }]);

    expect(cipherService.updateWithServer).toHaveBeenCalledTimes(1);
    expect(cipherService.updateWithServer).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "c1",
        fields: [
          expect.objectContaining({ type: FieldType.Text, name: "note", value: "hi" }),
          expect.objectContaining({
            type: FieldType.Hidden,
            name: TOTP_ORDER_FIELD,
            value: "1500",
          }),
        ],
      }),
      userId,
    );
  });

  it("does not write when the cipher already has the same order", async () => {
    const service = createService();
    cipherService.getAllDecrypted.mockResolvedValue([
      {
        id: "c1",
        name: "Mail",
        login: { totp: "WQIQ25BRKZYCJVYP" },
        fields: [{ type: FieldType.Hidden, name: TOTP_ORDER_FIELD, value: "1500" }],
      },
    ] as never);

    await service.writeTotpOrders([{ secret: "WQIQ25BRKZYCJVYP", order: 1500 }]);

    expect(cipherService.updateWithServer).not.toHaveBeenCalled();
  });

  it("reads the hidden order and fails when the secret has no cipher", async () => {
    const service = createService();
    cipherService.getAllDecrypted.mockResolvedValue([
      {
        id: "c1",
        name: "Mail",
        login: { totp: "WQIQ25BRKZYCJVYP" },
        fields: [{ type: FieldType.Hidden, name: TOTP_ORDER_FIELD, value: "1500" }],
      },
    ] as never);

    await expect(service.totpOrderIndex()).resolves.toEqual({
      orderBySecret: new Map([["WQIQ25BRKZYCJVYP", 1500]]),
      secretsWithCipher: new Set(["WQIQ25BRKZYCJVYP"]),
    });
    await expect(
      service.writeTotpOrders([{ secret: "BEASECRETSECRET", order: 1000 }]),
    ).rejects.toBeInstanceOf(TotpOrderCipherMissingError);
  });
});

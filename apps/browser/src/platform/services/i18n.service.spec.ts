import { BehaviorSubject } from "rxjs";

import { GlobalStateProvider } from "@bitwarden/common/platform/state";

import I18nService, { DEFAULT_LOCALE } from "./i18n.service";

describe("browser I18nService", () => {
  const messages = {
    vault: { message: "密码库" },
    saveLogin: { message: "保存登录" },
  };

  function create(stored: string | null, systemLanguage = "en-US") {
    const state$ = new BehaviorSubject<string | null>(stored);
    const globalStateProvider = {
      get: () => ({
        state$,
        update: async (updater: (value: string | null) => string | null) => {
          state$.next(updater(state$.value));
        },
      }),
    } as unknown as GlobalStateProvider;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => messages,
    }) as unknown as typeof fetch;
    return new I18nService(systemLanguage, globalStateProvider);
  }

  it("uses Simplified Chinese when the user has not chosen a language", async () => {
    const service = create(null, "en-US");

    await service.init();

    expect(service.translationLocale).toBe(DEFAULT_LOCALE);
    expect(service.t("vault")).toBe("密码库");
  });

  it("keeps a language the user chose in settings", async () => {
    const service = create("de", "zh-CN");

    await service.init();

    expect(service.translationLocale).toBe("de");
  });
});

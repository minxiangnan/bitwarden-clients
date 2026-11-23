import { BehaviorSubject } from "rxjs";

import { GlobalStateProvider } from "@bitwarden/common/platform/state";

import { I18nService, DEFAULT_LOCALE } from "./i18n.service";

describe("web I18nService", () => {
  function create(stored: string | null, systemLanguage = "en-US") {
    const state$ = new BehaviorSubject<string | null>(stored);
    const globalStateProvider = {
      get: () => ({
        state$,
        update: async () => undefined,
      }),
    } as unknown as GlobalStateProvider;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        vault: { message: "密码库" },
      }),
    }) as unknown as typeof fetch;
    return new I18nService(systemLanguage, "./locales", globalStateProvider);
  }

  it("uses Simplified Chinese when the browser language is English and no locale is stored", async () => {
    const service = create(null, "en-US");

    await service.init();

    expect(service.translationLocale).toBe(DEFAULT_LOCALE);
    expect(service.t("vault")).toBe("密码库");
  });

  it("uses the locale stored by the language setting", async () => {
    const service = create("fr", "zh-CN");

    await service.init();

    expect(service.translationLocale).toBe("fr");
  });
});

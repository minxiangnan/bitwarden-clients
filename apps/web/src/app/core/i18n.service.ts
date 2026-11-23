import { firstValueFrom } from "rxjs";

import { I18nService as BaseI18nService } from "@bitwarden/common/platform/services/i18n.service";
import { TranslationService } from "@bitwarden/common/platform/services/translation.service";
import { GlobalStateProvider } from "@bitwarden/common/platform/state";

import { SupportedTranslationLocales } from "../../translation-constants";

export const DEFAULT_LOCALE = "zh-CN";

export class I18nService extends BaseI18nService {
  constructor(
    _systemLanguage: string,
    localesDirectory: string,
    globalStateProvider: GlobalStateProvider,
  ) {
    super(
      DEFAULT_LOCALE,
      localesDirectory,
      async (formattedLocale: string) => {
        const filePath =
          this.localesDirectory +
          "/" +
          formattedLocale +
          "/messages.json?cache=" +
          process.env.CACHE_TAG;
        const localesResult = await fetch(filePath);
        const locales = await localesResult.json();
        return locales;
      },
      globalStateProvider,
    );

    this.defaultLocale = DEFAULT_LOCALE;
    this.supportedTranslationLocales = SupportedTranslationLocales;
  }

  override async init() {
    const storedLocale = await firstValueFrom(this.translationLocaleState.state$);
    await TranslationService.prototype.init.call(this, storedLocale || DEFAULT_LOCALE);
  }
}

// FIXME: Update this file to be type safe and remove this and next line
// @ts-strict-ignore
import { firstValueFrom } from "rxjs";

import { I18nService as BaseI18nService } from "@bitwarden/common/platform/services/i18n.service";
import { TranslationService } from "@bitwarden/common/platform/services/translation.service";
import { GlobalStateProvider } from "@bitwarden/common/platform/state";

export const DEFAULT_LOCALE = "zh-CN";

export default class I18nService extends BaseI18nService {
  constructor(_systemLanguage: string, globalStateProvider: GlobalStateProvider) {
    super(
      DEFAULT_LOCALE,
      typeof chrome !== "undefined" && chrome.runtime?.getURL != null
        ? chrome.runtime.getURL("_locales/")
        : "/_locales/",
      async (formattedLocale: string) => {
        const file = await fetch(this.localesDirectory + formattedLocale + "/messages.json");
        return await file.json();
      },
      globalStateProvider,
    );

    // An unset language is Simplified Chinese, not the browser language.
    // English remains available when the user picks it in settings.
    this.defaultLocale = DEFAULT_LOCALE;

    // Please leave 'en' where it is, as it's our fallback language in case no translation can be found
    this.supportedTranslationLocales = [
      "en",
      "ar",
      "az",
      "be",
      "bg",
      "bn",
      "bs",
      "ca",
      "cs",
      "cy",
      "da",
      "de",
      "el",
      "en-GB",
      "en-IN",
      "es",
      "et",
      "eu",
      "fa",
      "fi",
      "fil",
      "fr",
      "gl",
      "he",
      "hi",
      "hr",
      "hu",
      "id",
      "it",
      "ja",
      "ka",
      "km",
      "kn",
      "ko",
      "lt",
      "lv",
      "ml",
      "mr",
      "my",
      "nb",
      "ne",
      "nl",
      "nn",
      "or",
      "pl",
      "pt-BR",
      "pt-PT",
      "ro",
      "ru",
      "si",
      "sk",
      "sl",
      "sr",
      "sv",
      "ta",
      "te",
      "th",
      "tr",
      "uk",
      "vi",
      "zh-CN",
      "zh-TW",
    ];
  }

  override async init() {
    const storedLocale = await firstValueFrom(this.translationLocaleState.state$);
    await TranslationService.prototype.init.call(this, storedLocale || DEFAULT_LOCALE);
  }

  override async setLocale(locale: string | null): Promise<void> {
    await super.setLocale(locale);
    if (typeof chrome !== "undefined" && chrome.storage?.local != null) {
      await chrome.storage.local.set({ bwLocale: locale || DEFAULT_LOCALE });
    }
  }

  t(id: string, p1?: string, p2?: string, p3?: string): string {
    return this.translate(id, p1, p2, p3);
  }

  translate(id: string, p1?: string, p2?: string, p3?: string): string {
    if (this.localeMessages != null && this.localeMessages[id]) {
      return super.translate(id, p1?.toString(), p2?.toString(), p3?.toString());
    }

    if (this.localesDirectory == null) {
      const placeholders: string[] = [];
      if (p1 != null) {
        placeholders.push(p1);
      }
      if (p2 != null) {
        placeholders.push(p2);
      }
      if (p3 != null) {
        placeholders.push(p3);
      }

      if (placeholders.length) {
        return chrome.i18n.getMessage(
          id,
          placeholders.map((placeholder) => placeholder.toString()),
        );
      } else {
        return chrome.i18n.getMessage(id);
      }
    }

    return super.translate(id, p1?.toString(), p2?.toString(), p3?.toString());
  }
}

/**
 * Chrome picks `_locales/en` whenever the browser language is English, even if
 * `default_locale` is Chinese. Extension pages that call `chrome.i18n.getMessage`
 * (the notification bar, inline menu, and content scripts) therefore need a catalog
 * that does not follow the browser language.
 *
 * The catalog starts as zh_CN. If the user has chosen another language in settings,
 * `bwLocale` in extension storage replaces it. An unset choice stays Chinese.
 */

type MessageEntry = {
  message?: string;
  placeholders?: Record<string, { content?: string } | undefined>;
};

type Catalog = Record<string, MessageEntry>;

// eslint-disable-next-line @typescript-eslint/no-require-imports
const zhCN = require("../../_locales/zh_CN/messages.json") as Catalog;

let catalog: Catalog = zhCN;

export const DEFAULT_EXTENSION_LOCALE = "zh-CN";

function substitutionList(substitutions?: string | string[]): string[] {
  if (substitutions == null) {
    return [];
  }
  return Array.isArray(substitutions) ? substitutions.map((value) => String(value)) : [String(substitutions)];
}

export function formatExtensionMessage(name: string, substitutions?: string | string[]): string {
  const entry = catalog[name];
  if (entry?.message == null || entry.message === "") {
    return "";
  }

  let result = entry.message;
  const subs = substitutionList(substitutions);
  if (entry.placeholders) {
    for (const [key, placeholder] of Object.entries(entry.placeholders)) {
      const content = placeholder?.content ?? "";
      const index = /^\$[1-9]$/.test(content) ? Number(content.slice(1)) - 1 : -1;
      const replacement = index >= 0 ? (subs[index] ?? "") : content;
      result = result.replace(new RegExp("\\$" + key + "\\$", "gi"), replacement);
    }
  }
  subs.forEach((sub, index) => {
    result = result.replace(new RegExp("\\$" + (index + 1), "g"), sub);
  });
  return result;
}

function installGetMessage() {
  if (typeof chrome === "undefined" || chrome.i18n == null) {
    return;
  }
  chrome.i18n.getMessage = ((name: string, substitutions?: string | string[]) =>
    formatExtensionMessage(name, substitutions)) as typeof chrome.i18n.getMessage;
}

installGetMessage();

export async function applyStoredExtensionLocale(): Promise<void> {
  if (typeof chrome === "undefined" || chrome.storage?.local == null || chrome.runtime?.getURL == null) {
    return;
  }
  try {
    const stored = await chrome.storage.local.get("bwLocale");
    const locale = typeof stored.bwLocale === "string" && stored.bwLocale !== "" ? stored.bwLocale : DEFAULT_EXTENSION_LOCALE;
    const formatted = locale.replace("-", "_");
    if (formatted === "zh_CN") {
      catalog = zhCN;
      return;
    }
    const response = await fetch(chrome.runtime.getURL(`_locales/${formatted}/messages.json`));
    if (!response.ok) {
      return;
    }
    catalog = (await response.json()) as Catalog;
  } catch {
    catalog = zhCN;
  }
}

void applyStoredExtensionLocale();

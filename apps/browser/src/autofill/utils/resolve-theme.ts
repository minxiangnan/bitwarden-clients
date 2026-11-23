import { Theme, ThemeTypes } from "@bitwarden/common/platform/enums";

export function resolveTheme(theme: Theme | string | undefined): Theme {
  // Injected UI stays on the warm light palette unless the user picks Dark in settings.
  // System, an empty value, and the page color scheme do not turn it charcoal.
  return theme === ThemeTypes.Dark ? ThemeTypes.Dark : ThemeTypes.Light;
}

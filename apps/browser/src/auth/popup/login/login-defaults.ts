import { Region, Urls } from "@bitwarden/common/platform/abstractions/environment.service";

/** First-run server for this fork. A saved environment is never replaced with it. */
export const DEFAULT_SELF_HOSTED_SERVER = "https://bitwarden.pub.monite.cn";

/** Shown when this browser has not remembered an email address. */
export const DEFAULT_LOGIN_EMAIL = "minxiangnan@qq.com";

/**
 * Server field for a fresh install: self-hosted at {@link DEFAULT_SELF_HOSTED_SERVER}.
 * A cloud region or any saved self-hosted URL is left alone.
 */
export function initialSelfHostedServerUrl(region: Region, urls?: Urls | null): string {
  const base = urls?.base?.trim() ?? "";
  if (region !== Region.SelfHosted) {
    return base;
  }
  if (base) {
    return base;
  }
  const savedPiece = [
    urls?.webVault,
    urls?.api,
    urls?.identity,
    urls?.icons,
    urls?.notifications,
    urls?.events,
    urls?.keyConnector,
    urls?.send,
  ].some((value) => value != null && value.trim() !== "");
  if (savedPiece) {
    return base;
  }
  return DEFAULT_SELF_HOSTED_SERVER;
}

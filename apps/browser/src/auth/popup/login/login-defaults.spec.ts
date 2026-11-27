import { Region } from "@bitwarden/common/platform/abstractions/environment.service";

import {
  DEFAULT_LOGIN_EMAIL,
  DEFAULT_SELF_HOSTED_SERVER,
  initialSelfHostedServerUrl,
} from "./login-defaults";

describe("login defaults", () => {
  it("fills the fork server when the environment was never saved", () => {
    expect(initialSelfHostedServerUrl(Region.SelfHosted, undefined)).toBe(
      DEFAULT_SELF_HOSTED_SERVER,
    );
    expect(initialSelfHostedServerUrl(Region.SelfHosted, { base: "  " })).toBe(
      DEFAULT_SELF_HOSTED_SERVER,
    );
    expect(DEFAULT_LOGIN_EMAIL).toBe("minxiangnan@qq.com");
  });

  it("keeps a server the user already saved", () => {
    expect(
      initialSelfHostedServerUrl(Region.SelfHosted, { base: "https://vault.example.com" }),
    ).toBe("https://vault.example.com");
    expect(initialSelfHostedServerUrl(Region.US, { base: null })).toBe("");
    expect(
      initialSelfHostedServerUrl(Region.SelfHosted, {
        base: "",
        api: "https://vault.example.com/api",
      }),
    ).toBe("");
  });
});

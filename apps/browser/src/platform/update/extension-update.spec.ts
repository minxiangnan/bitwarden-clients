import {
  AUTHENTICATOR_RELEASE_VERSION,
  CREAM,
  TERRACOTTA,
  compareVersions,
  detectBrowserKind,
  downloadUrlFor,
  endOfLocalDay,
  isNewerVersion,
  noticeFor,
  selectLatestRelease,
  UPDATE_STEPS,
  shouldCheckAutomatically,
  UPDATE_CHECK_INTERVAL_MS,
  type ExtensionRelease,
  type StoredExtensionUpdate,
} from "./extension-update";

const chromeUrl =
  "https://github.com/minxiangnan/bitwarden-clients/releases/download/v-zh-authenticator-1.2.0/zh-authenticator-chrome-1.2.0.zip";
const edgeUrl =
  "https://github.com/minxiangnan/bitwarden-clients/releases/download/v-zh-authenticator-1.2.0/zh-authenticator-edge-1.2.0.zip";
const firefoxUrl =
  "https://github.com/minxiangnan/bitwarden-clients/releases/download/v-zh-authenticator-1.2.0/zh-authenticator-firefox-1.2.0.zip";

function release(tag: string, extra: Record<string, unknown> = {}) {
  const version = tag.replace("v-zh-authenticator-", "");
  const asset = (kind: string, url: string) => ({
    name: `zh-authenticator-${kind}-${version}.zip`,
    browser_download_url: url,
  });
  return {
    tag_name: tag,
    draft: false,
    prerelease: false,
    body: `说明 ${version}`,
    html_url: `https://github.com/minxiangnan/bitwarden-clients/releases/tag/${tag}`,
    assets: [asset("chrome", chromeUrl), asset("edge", edgeUrl), asset("firefox", firefoxUrl)],
    ...extra,
  };
}

describe("extension update selection", () => {
  const payload = [
    release("v-zh-authenticator-android-2.0.0"),
    release("v-zh-authenticator-1.1.8"),
    release("v-zh-authenticator-1.2.0", { prerelease: true, body: "预发布" }),
    release("v-zh-authenticator-1.1.10", { draft: true }),
    release("v-zh-authenticator-1.1.9"),
    { tag_name: "v1.0.0", draft: false, prerelease: false },
  ];

  it("keeps the newest stable browser tag and skips android, drafts, and prereleases", () => {
    const latest = selectLatestRelease(payload);

    expect(latest?.version).toBe("1.1.9");
    expect(latest?.tag).toBe("v-zh-authenticator-1.1.9");
    expect(latest?.notes).toBe("说明 1.1.9");
  });

  it("compares numeric segments so 1.1.10 is newer than 1.1.9", () => {
    expect(compareVersions("1.1.10", "1.1.9")).toBeGreaterThan(0);
    expect(isNewerVersion("1.1.9", AUTHENTICATOR_RELEASE_VERSION)).toBe(false);
    expect(isNewerVersion("1.2.0", "1.1.9")).toBe(true);
    expect(isNewerVersion("1.2.1", "1.2.0")).toBe(true);
    expect(isNewerVersion("1.2.2", "1.2.1")).toBe(true);
    expect(isNewerVersion("1.2.3", "1.2.2")).toBe(true);
    expect(isNewerVersion("1.2.4", "1.2.3")).toBe(true);
    expect(isNewerVersion("1.2.5", "1.2.4")).toBe(true);
    expect(isNewerVersion("1.1.8", "1.1.9")).toBe(false);
  });

  it("picks the zip for the current browser", () => {
    const latest = selectLatestRelease([release("v-zh-authenticator-1.2.0")]) as ExtensionRelease;

    expect(downloadUrlFor(latest, "edge")).toBe(edgeUrl);
    expect(downloadUrlFor(latest, "firefox")).toBe(firefoxUrl);
    expect(detectBrowserKind("Mozilla/5.0 Edg/120.0")).toBe("edge");
    expect(detectBrowserKind("Mozilla/5.0 Firefox/120.0")).toBe("firefox");
    expect(detectBrowserKind("Mozilla/5.0 Chrome/120.0")).toBe("chrome");
  });

  it("hides the notice after snooze until the next local day, and after ignore", () => {
    const latest = selectLatestRelease([release("v-zh-authenticator-1.2.0")]) as ExtensionRelease;
    const now = Date.parse("2026-11-26T08:00:00");
    const state: StoredExtensionUpdate = {
      checkedAt: now,
      release: latest,
      snoozedUntil: null,
      ignoredVersion: null,
    };

    expect(noticeFor(state, "1.1.9", now, "chrome")?.downloadUrl).toBe(chromeUrl);

    const snoozed = { ...state, snoozedUntil: endOfLocalDay(now) };
    expect(noticeFor(snoozed, "1.1.9", now, "chrome")).toBeNull();
    expect(noticeFor(snoozed, "1.1.9", endOfLocalDay(now), "chrome")?.version).toBe("1.2.0");

    const ignored = { ...state, ignoredVersion: "1.2.0" };
    expect(noticeFor(ignored, "1.1.9", now, "chrome")).toBeNull();
  });

  it("checks automatically at most once a day unless the user asks", () => {
    const now = UPDATE_CHECK_INTERVAL_MS * 3;
    expect(shouldCheckAutomatically(0, now)).toBe(true);
    expect(shouldCheckAutomatically(now - UPDATE_CHECK_INTERVAL_MS + 1, now)).toBe(false);
    expect(shouldCheckAutomatically(now - UPDATE_CHECK_INTERVAL_MS, now)).toBe(true);
  });

  it("uses cream and terracotta, not black", () => {
    expect(CREAM.toLowerCase()).not.toBe("#000");
    expect(CREAM.toLowerCase()).not.toBe("#000000");
    expect(TERRACOTTA.toLowerCase()).not.toBe("#000000");
  });

  it("tells the user to overwrite the same folder and refresh, without an automatic download", () => {
    expect(UPDATE_STEPS).toContain("解压覆盖到同一文件夹并点刷新");
    expect(UPDATE_STEPS).toContain("不要解压到新文件夹");
    expect(UPDATE_STEPS).toContain("不会自动下载或安装");
  });
});

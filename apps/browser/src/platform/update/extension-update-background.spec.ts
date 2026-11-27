import { BrowserApi } from "../browser/browser-api";
import { consumeRuntimeLastError } from "../browser/runtime-channel";

import {
  UPDATE_CHECK_INTERVAL_MS,
  UPDATE_STORAGE_KEY,
  type StoredExtensionUpdate,
} from "./extension-update";
import {
  checkForExtensionUpdate,
  downloadExtensionUpdate,
  readUpdateState,
  watchUpdateNotice,
} from "./extension-update-background";

describe("extension update background", () => {
  const releasePayload = [
    {
      tag_name: "v-zh-authenticator-android-3.0.0",
      draft: false,
      prerelease: false,
      body: "android",
      assets: [] as { name?: string; browser_download_url?: string }[],
    },
    {
      tag_name: "v-zh-authenticator-1.2.0",
      draft: false,
      prerelease: false,
      body: "修复保存提示",
      html_url:
        "https://github.com/minxiangnan/bitwarden-clients/releases/tag/v-zh-authenticator-1.2.0",
      assets: [
        {
          name: "zh-authenticator-chrome-1.2.0.zip",
          browser_download_url: "https://example.test/chrome.zip",
        },
      ],
    },
  ];

  it("stores the latest stable release and asks for a badge", async () => {
    const written: StoredExtensionUpdate[] = [];
    const badges: string[] = [];

    const result = await checkForExtensionUpdate({
      force: true,
      now: 5_000,
      currentVersion: "1.1.9",
      browser: "chrome",
      fetchImpl: jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(releasePayload),
      }) as unknown as typeof fetch,
      readState: async () => ({
        checkedAt: 0,
        attemptedAt: 0,
        release: null,
        snoozedUntil: null,
        ignoredVersion: null,
      }),
      writeState: async (state) => {
        written.push(state);
      },
      setBadge: (text) => badges.push(text),
    });

    expect(result).toEqual({
      ok: true,
      statusText: "发现新版本 1.2.0。解压覆盖到同一文件夹并点刷新。",
      noticeVersion: "1.2.0",
    });
    expect(written[0]?.release?.version).toBe("1.2.0");
    expect(badges).toEqual(["新"]);
  });

  it("does not fetch again the same day unless the user asks", async () => {
    const fetchImpl = jest.fn();
    const now = UPDATE_CHECK_INTERVAL_MS * 2;

    const result = await checkForExtensionUpdate({
      now,
      currentVersion: "1.1.9",
      browser: "chrome",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      readState: async () => ({
        checkedAt: now - 60_000,
        attemptedAt: now - 60_000,
        release: null,
        snoozedUntil: null,
        ignoredVersion: null,
      }),
      writeState: async () => undefined,
      setBadge: () => undefined,
    });

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result.statusText).toBe("已是最新版本 1.1.9");
  });

  it("waits for the storage callback when the returned promise is empty", async () => {
    (chrome.storage.local.get as jest.Mock).mockImplementation(
      (_key: string, callback: (items: Record<string, unknown>) => void) => {
        setTimeout(() => {
          callback({ [UPDATE_STORAGE_KEY]: { checkedAt: 7, release: null } });
        }, 0);
        return Promise.resolve(undefined);
      },
    );

    const state = await readUpdateState();

    expect(state.checkedAt).toBe(7);
  });

  it("reads lastError when storage returns through a callback", async () => {
    let reads = 0;
    Object.defineProperty(chrome.runtime, "lastError", {
      configurable: true,
      get: () => {
        reads += 1;
        return { message: "storage failed" };
      },
    });
    (chrome.storage.local.get as jest.Mock).mockImplementation(
      (_key: string, callback: (items: Record<string, unknown>) => void) => {
        callback({ [UPDATE_STORAGE_KEY]: { checkedAt: 1, release: null } });
      },
    );

    const state = await readUpdateState();

    expect(state.checkedAt).toBe(1);
    expect(reads).toBeGreaterThan(0);
    expect(consumeRuntimeLastError()).toBe("storage failed");
    delete (chrome.runtime as { lastError?: chrome.runtime.LastError }).lastError;
  });

  it("replays a stored notice to a subscriber that arrives later", async () => {
    (chrome.storage.local.get as jest.Mock).mockImplementation(
      (_key: string, callback: (items: Record<string, unknown>) => void) => {
        callback({
          [UPDATE_STORAGE_KEY]: {
            checkedAt: 1,
            snoozedUntil: null,
            ignoredVersion: null,
            release: {
              version: "9.9.9",
              tag: "v-zh-authenticator-9.9.9",
              notes: "",
              releaseUrl:
                "https://github.com/minxiangnan/bitwarden-clients/releases/tag/v-zh-authenticator-9.9.9",
              downloads: { chrome: "https://example.test/chrome.zip" },
            },
          },
        });
      },
    );

    const first: Array<string | null> = [];
    const early = watchUpdateNotice().subscribe((notice) => {
      first.push(notice?.version ?? null);
    });
    await Promise.resolve();
    expect(first.at(-1)).toBe("9.9.9");

    const later: Array<string | null> = [];
    const late = watchUpdateNotice().subscribe((notice) => {
      later.push(notice?.version ?? null);
    });
    expect(later).toEqual(["9.9.9"]);
    early.unsubscribe();
    late.unsubscribe();
  });

  it("reuses a settings check from the last few minutes", async () => {
    const fetchImpl = jest.fn();
    const now = 1_000_000;

    const result = await checkForExtensionUpdate({
      now,
      maxAgeMs: 5 * 60 * 1000,
      currentVersion: "1.2.8",
      browser: "chrome",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      readState: async () => ({
        checkedAt: now - 60_000,
        attemptedAt: now - 60_000,
        release: null,
        snoozedUntil: null,
        ignoredVersion: null,
      }),
      writeState: async () => undefined,
      setBadge: () => undefined,
    });

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result.ok).toBe(true);
    expect(result.noticeVersion).toBeNull();
  });

  it("keeps a known release when the settings check cannot reach GitHub", async () => {
    const written: StoredExtensionUpdate[] = [];

    const result = await checkForExtensionUpdate({
      now: 5_000,
      maxAgeMs: 5 * 60 * 1000,
      currentVersion: "1.2.8",
      browser: "chrome",
      fetchImpl: jest.fn().mockRejectedValue(new Error("offline")) as unknown as typeof fetch,
      readState: async () => ({
        checkedAt: 0,
        attemptedAt: 0,
        release: {
          version: "1.2.9",
          tag: "v-zh-authenticator-1.2.9",
          notes: "短说明",
          releaseUrl: "https://example.test/release",
          downloads: { chrome: "https://example.test/chrome.zip" },
        },
        snoozedUntil: null,
        ignoredVersion: null,
      }),
      writeState: async (state) => {
        written.push(state);
      },
      setBadge: () => undefined,
    });

    expect(result.ok).toBe(false);
    expect(written[0]?.attemptedAt).toBe(5_000);
    expect(written[0]?.checkedAt).toBe(0);
    expect(written[0]?.release?.version).toBe("1.2.9");
  });

  it("downloads the zip for this browser", async () => {
    const download = jest.fn(
      (_options: chrome.downloads.DownloadOptions, callback: (downloadId: number) => void) => {
        callback(7);
      },
    );
    Object.assign(chrome, { downloads: { download } });
    const opened = jest.spyOn(BrowserApi, "createNewTab").mockResolvedValue({} as chrome.tabs.Tab);

    const saved = await downloadExtensionUpdate(
      "https://example.test/zh-authenticator-chrome-1.2.9.zip",
    );

    expect(saved).toBe(true);
    expect(download).toHaveBeenCalledWith(
      {
        url: "https://example.test/zh-authenticator-chrome-1.2.9.zip",
        filename: "zh-authenticator-chrome-1.2.9.zip",
        saveAs: false,
      },
      expect.any(Function),
    );
    expect(opened).not.toHaveBeenCalled();
    delete (chrome as { downloads?: unknown }).downloads;
    opened.mockRestore();
  });

  it("opens the asset when downloads are unavailable", async () => {
    delete (chrome as { downloads?: unknown }).downloads;
    const opened = jest.spyOn(BrowserApi, "createNewTab").mockResolvedValue({} as chrome.tabs.Tab);

    const saved = await downloadExtensionUpdate(
      "https://example.test/zh-authenticator-firefox-1.2.9.zip",
    );

    expect(saved).toBe(true);
    expect(opened).toHaveBeenCalledWith("https://example.test/zh-authenticator-firefox-1.2.9.zip");
    opened.mockRestore();
  });
});

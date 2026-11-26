import { consumeRuntimeLastError } from "../browser/runtime-channel";

import {
  UPDATE_CHECK_INTERVAL_MS,
  UPDATE_STORAGE_KEY,
  type StoredExtensionUpdate,
} from "./extension-update";
import { checkForExtensionUpdate, readUpdateState } from "./extension-update-background";

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
      statusText: "发现新版本 1.2.0",
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
});

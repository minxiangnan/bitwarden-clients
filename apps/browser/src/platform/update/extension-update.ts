/**
 * User-facing authenticator release. The manifest version stays on the
 * 2026.11.N line so Chrome treats each build as newer; this string is what we
 * compare with GitHub tags `v-zh-authenticator-X.Y.Z`.
 */
export const AUTHENTICATOR_RELEASE_VERSION = "1.2.2";

/**
 * GitHub releases API. Chrome MV3 host_permissions already includes every
 * https host, and Firefox already has all_urls. Both cover
 * api.github.com, so the manifest does not add a second host.
 */
export const RELEASES_URL = "https://api.github.com/repos/minxiangnan/bitwarden-clients/releases";

export const UPDATE_STEPS =
  "更新步骤：点「下载新版」保存 zip，解压后覆盖原来的扩展文件夹，然后打开扩展管理页点刷新。扩展不会自动下载或安装。";

export const UPDATE_STORAGE_KEY = "zhAuthenticatorUpdate";

export const UPDATE_CHECK_ALARM = "zh-authenticator-update-check";

/** Automatic checks stay at least this far apart. */
export const UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

export const CREAM = "#FAF9F5";
export const INK = "#3D3929";
export const MUTED = "#5C584E";
export const TERRACOTTA = "#C4532A";
export const CREAM_LINE = "#E8E6DC";

const TAG_PATTERN = /^v-zh-authenticator-(\d+\.\d+\.\d+)$/;
const ANDROID_TAG_PREFIX = "v-zh-authenticator-android";

export type BrowserKind = "chrome" | "edge" | "firefox";

export type ExtensionRelease = {
  version: string;
  tag: string;
  notes: string;
  releaseUrl: string;
  downloads: Partial<Record<BrowserKind, string>>;
};

export type StoredExtensionUpdate = {
  checkedAt: number;
  release: ExtensionRelease | null;
  snoozedUntil: number | null;
  ignoredVersion: string | null;
};

export type UpdateNotice = {
  version: string;
  notes: string;
  downloadUrl: string;
  releaseUrl: string;
};

export function emptyUpdateState(now = 0): StoredExtensionUpdate {
  return {
    checkedAt: now,
    release: null,
    snoozedUntil: null,
    ignoredVersion: null,
  };
}

export function detectBrowserKind(userAgent: string): BrowserKind {
  if (userAgent.includes("Edg/")) {
    return "edge";
  }
  if (userAgent.includes("Firefox/")) {
    return "firefox";
  }
  return "chrome";
}

export function compareVersions(left: string, right: string): number {
  const a = left.split(".").map((part) => Number(part) || 0);
  const b = right.split(".").map((part) => Number(part) || 0);
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index++) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) {
      return difference;
    }
  }
  return 0;
}

export function isNewerVersion(candidate: string, current: string): boolean {
  return compareVersions(candidate, current) > 0;
}

type GithubAsset = { name?: string; browser_download_url?: string };
type GithubRelease = {
  tag_name?: string;
  draft?: boolean;
  prerelease?: boolean;
  body?: string | null;
  html_url?: string;
  assets?: GithubAsset[];
};

function notesFromBody(body: string | null | undefined): string {
  const text = (body ?? "")
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.replace(/^#+\s*/, "").trim())
    .filter((line) => line.length > 0 && !line.startsWith("|") && !line.startsWith("<!--"))
    .join(" ");
  if (text.length <= 280) {
    return text;
  }
  return `${text.slice(0, 277)}…`;
}

function downloadsFor(assets: GithubAsset[] | undefined): ExtensionRelease["downloads"] {
  const downloads: ExtensionRelease["downloads"] = {};
  for (const asset of assets ?? []) {
    const name = asset.name ?? "";
    const url = asset.browser_download_url;
    if (!url || !name.endsWith(".zip")) {
      continue;
    }
    if (name.includes("chrome")) {
      downloads.chrome = url;
    } else if (name.includes("edge")) {
      downloads.edge = url;
    } else if (name.includes("firefox")) {
      downloads.firefox = url;
    }
  }
  return downloads;
}

/** Latest stable `v-zh-authenticator-X.Y.Z` release. Android tags are skipped. */
export function selectLatestRelease(payload: unknown): ExtensionRelease | null {
  if (!Array.isArray(payload)) {
    return null;
  }
  const releases: ExtensionRelease[] = [];
  for (const entry of payload as GithubRelease[]) {
    const tag = entry.tag_name ?? "";
    if (entry.draft || entry.prerelease || tag.startsWith(ANDROID_TAG_PREFIX)) {
      continue;
    }
    const match = TAG_PATTERN.exec(tag);
    if (match == null) {
      continue;
    }
    releases.push({
      version: match[1],
      tag,
      notes: notesFromBody(entry.body),
      releaseUrl:
        entry.html_url ?? `https://github.com/minxiangnan/bitwarden-clients/releases/tag/${tag}`,
      downloads: downloadsFor(entry.assets),
    });
  }
  releases.sort((left, right) => compareVersions(right.version, left.version));
  return releases[0] ?? null;
}

export function downloadUrlFor(release: ExtensionRelease, browser: BrowserKind): string {
  return release.downloads[browser] ?? release.downloads.chrome ?? release.releaseUrl;
}

export function shouldCheckAutomatically(checkedAt: number, now: number, slackMs = 0): boolean {
  if (checkedAt <= 0) {
    return true;
  }
  return now - checkedAt >= UPDATE_CHECK_INTERVAL_MS - slackMs;
}

export function endOfLocalDay(now: number): number {
  const date = new Date(now);
  date.setHours(24, 0, 0, 0);
  return date.getTime();
}

export function noticeFor(
  state: StoredExtensionUpdate | null,
  currentVersion: string,
  now: number,
  browser: BrowserKind,
): UpdateNotice | null {
  const release = state?.release;
  if (release == null || !isNewerVersion(release.version, currentVersion)) {
    return null;
  }
  if (state?.ignoredVersion === release.version) {
    return null;
  }
  if (state?.snoozedUntil != null && now < state.snoozedUntil) {
    return null;
  }
  return {
    version: release.version,
    notes: release.notes,
    downloadUrl: downloadUrlFor(release, browser),
    releaseUrl: release.releaseUrl,
  };
}

export function normalizeStoredUpdate(value: unknown): StoredExtensionUpdate {
  if (value == null || typeof value !== "object") {
    return emptyUpdateState();
  }
  const record = value as Partial<StoredExtensionUpdate>;
  return {
    checkedAt: typeof record.checkedAt === "number" ? record.checkedAt : 0,
    release: record.release ?? null,
    snoozedUntil: typeof record.snoozedUntil === "number" ? record.snoozedUntil : null,
    ignoredVersion: typeof record.ignoredVersion === "string" ? record.ignoredVersion : null,
  };
}

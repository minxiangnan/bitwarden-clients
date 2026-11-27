import { BehaviorSubject, Observable } from "rxjs";
import { map, share } from "rxjs/operators";

import type { BadgeStateFunction } from "../badge/badge.service";
import { BadgeStatePriority } from "../badge/priority";
import { BrowserApi } from "../browser/browser-api";
import { consumeRuntimeLastError } from "../browser/runtime-channel";

import {
  AUTHENTICATOR_RELEASE_VERSION,
  CREAM,
  RELEASES_URL,
  TERRACOTTA,
  UPDATE_CHECK_ALARM,
  UPDATE_CHECK_INTERVAL_MS,
  UPDATE_STORAGE_KEY,
  detectBrowserKind,
  endOfLocalDay,
  normalizeStoredUpdate,
  noticeFor,
  selectLatestRelease,
  shouldCheckAutomatically,
  type BrowserKind,
  type StoredExtensionUpdate,
  type UpdateNotice,
} from "./extension-update";

export type UpdateCheckResult = {
  ok: boolean;
  statusText: string;
  noticeVersion: string | null;
};

type UpdateDeps = {
  now?: number;
  force?: boolean;
  currentVersion?: string;
  browser?: BrowserKind;
  fetchImpl?: typeof fetch;
  readState?: () => Promise<StoredExtensionUpdate>;
  writeState?: (state: StoredExtensionUpdate) => Promise<void>;
  setBadge?: (text: string) => void;
};

const MINUTE_MS = 60 * 1000;
const badgeVisible$ = new BehaviorSubject(false);

function isThenable(value: unknown): value is Promise<unknown> {
  return value != null && typeof (value as { then?: unknown }).then === "function";
}

function finishPromise(pending: unknown): void {
  if (!isThenable(pending)) {
    return;
  }
  void pending.catch((): void => undefined);
}

let sharedNotice$: Observable<UpdateNotice | null> | null = null;

/** The release the background check is currently offering, or null. */
export function watchUpdateNotice(): Observable<UpdateNotice | null> {
  if (sharedNotice$ != null) {
    return sharedNotice$;
  }
  sharedNotice$ = new Observable<UpdateNotice | null>((subscriber) => {
    let stopped = false;
    const emit = () => {
      void readUpdateState()
        .then((state) => {
          if (stopped) {
            return;
          }
          const agent = typeof navigator === "undefined" ? "" : navigator.userAgent;
          subscriber.next(
            noticeFor(state, AUTHENTICATOR_RELEASE_VERSION, Date.now(), detectBrowserKind(agent)),
          );
        })
        .catch(() => {
          if (!stopped) {
            subscriber.next(null);
          }
        });
    };
    emit();
    const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === "local" && changes[UPDATE_STORAGE_KEY]) {
        emit();
      }
    };
    const event = typeof chrome === "undefined" ? undefined : chrome.storage?.onChanged;
    if (event != null) {
      try {
        BrowserApi.addListener(event, listener);
      } catch {
        // The version line still renders from the last successful read.
      }
    }
    return () => {
      stopped = true;
      if (event != null) {
        try {
          BrowserApi.removeListener(event, listener);
        } catch {
          // The listener is already gone.
        }
      }
    };
  }).pipe(share({ resetOnRefCountZero: true }));
  return sharedNotice$;
}

export function readUpdateState(): Promise<StoredExtensionUpdate> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: unknown) => {
      if (settled) {
        return;
      }
      settled = true;
      const record =
        value != null && typeof value === "object"
          ? (value as Record<string, unknown>)[UPDATE_STORAGE_KEY]
          : undefined;
      resolve(normalizeStoredUpdate(record));
    };

    try {
      const pending = chrome.storage.local.get(UPDATE_STORAGE_KEY, (items) => {
        consumeRuntimeLastError();
        finish(items);
      });
      if (isThenable(pending)) {
        void pending.then(
          (items) => {
            consumeRuntimeLastError();
            if (items != null) {
              finish(items);
            }
          },
          (): void => {
            consumeRuntimeLastError();
          },
        );
      }
    } catch {
      consumeRuntimeLastError();
      finish(null);
    }
  });
}

export function writeUpdateState(state: StoredExtensionUpdate): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) {
        return;
      }
      settled = true;
      resolve();
    };
    try {
      const pending = chrome.storage.local.set({ [UPDATE_STORAGE_KEY]: state }, () => {
        consumeRuntimeLastError();
        finish();
      });
      if (isThenable(pending)) {
        void pending.then(
          () => {
            consumeRuntimeLastError();
            finish();
          },
          (): void => {
            consumeRuntimeLastError();
            finish();
          },
        );
      }
    } catch {
      consumeRuntimeLastError();
      finish();
    }
  });
}

export function applyUpdateBadge(text: string): void {
  const action = chrome.action ?? chrome.browserAction;
  if (action?.setBadgeText == null) {
    return;
  }
  try {
    finishPromise(
      action.setBadgeText({ text }, () => {
        consumeRuntimeLastError();
      }),
    );
    if (!text) {
      return;
    }
    finishPromise(
      action.setBadgeBackgroundColor({ color: TERRACOTTA }, () => {
        consumeRuntimeLastError();
      }),
    );
    const paintText = (
      action as {
        setBadgeTextColor?: (details: { color: string }, callback?: () => void) => unknown;
      }
    ).setBadgeTextColor;
    if (paintText) {
      finishPromise(
        paintText.call(action, { color: CREAM }, () => {
          consumeRuntimeLastError();
        }),
      );
    }
  } catch {
    consumeRuntimeLastError();
  }
}

function publishBadge(text: string): void {
  badgeVisible$.next(text.length > 0);
  applyUpdateBadge(text);
}

function syncBadge(state: StoredExtensionUpdate, now: number, browser: BrowserKind): void {
  const notice = noticeFor(state, AUTHENTICATOR_RELEASE_VERSION, now, browser);
  publishBadge(notice ? "新" : "");
}

/** Keeps the toolbar badge after the shared badge service redraws it for a tab. */
export function watchExtensionUpdateBadge(
  setState: (name: string, stateFunction: BadgeStateFunction) => void,
): void {
  setState("zh-authenticator-update", () =>
    badgeVisible$.pipe(
      map((visible) =>
        visible
          ? {
              priority: BadgeStatePriority.High,
              state: { text: "新", backgroundColor: TERRACOTTA },
            }
          : undefined,
      ),
    ),
  );
}

export async function checkForExtensionUpdate(deps: UpdateDeps = {}): Promise<UpdateCheckResult> {
  const now = deps.now ?? Date.now();
  const currentVersion = deps.currentVersion ?? AUTHENTICATOR_RELEASE_VERSION;
  const browser = deps.browser ?? detectBrowserKind(navigator.userAgent);
  const readState = deps.readState ?? readUpdateState;
  const writeState = deps.writeState ?? writeUpdateState;
  const setBadge = deps.setBadge ?? publishBadge;
  const previous = await readState();

  // Chrome may fire a daily alarm a little early. A one-minute window still checks once a day.
  if (!deps.force && !shouldCheckAutomatically(previous.checkedAt, now, MINUTE_MS)) {
    const notice = noticeFor(previous, currentVersion, now, browser);
    setBadge(notice ? "新" : "");
    return {
      ok: true,
      statusText: notice
        ? `发现新版本 ${notice.version}。解压覆盖到同一文件夹并点刷新。`
        : `已是最新版本 ${currentVersion}`,
      noticeVersion: notice?.version ?? null,
    };
  }

  try {
    const response = await (deps.fetchImpl ?? fetch)(`${RELEASES_URL}?per_page=100`, {
      headers: { Accept: "application/vnd.github+json" },
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error(`GitHub releases ${response.status}`);
    }
    const release = selectLatestRelease(await response.json());
    const next: StoredExtensionUpdate = {
      ...previous,
      checkedAt: now,
      release,
    };
    await writeState(next);
    const notice = noticeFor(next, currentVersion, now, browser);
    setBadge(notice ? "新" : "");
    return {
      ok: true,
      statusText: notice
        ? `发现新版本 ${notice.version}。解压覆盖到同一文件夹并点刷新。`
        : `已是最新版本 ${currentVersion}`,
      noticeVersion: notice?.version ?? null,
    };
  } catch {
    return {
      ok: false,
      statusText: "检查失败，请稍后再试",
      noticeVersion: null,
    };
  }
}

export async function snoozeExtensionUpdate(now = Date.now()): Promise<void> {
  const state = await readUpdateState();
  const next = { ...state, snoozedUntil: endOfLocalDay(now) };
  await writeUpdateState(next);
  syncBadge(next, now, detectBrowserKind(navigator.userAgent));
}

export async function ignoreExtensionUpdate(): Promise<void> {
  const state = await readUpdateState();
  const next: StoredExtensionUpdate = {
    ...state,
    ignoredVersion: state.release?.version ?? null,
    snoozedUntil: null,
  };
  await writeUpdateState(next);
  publishBadge("");
}

export function startExtensionUpdateChecker(): void {
  const browser = detectBrowserKind(navigator.userAgent);
  try {
    BrowserApi.addListener(chrome.alarms.onAlarm, (alarm) => {
      if (alarm.name !== UPDATE_CHECK_ALARM) {
        return;
      }
      void checkForExtensionUpdate();
    });
    BrowserApi.addListener(chrome.storage.onChanged, (changes, area) => {
      if (area !== "local" || changes[UPDATE_STORAGE_KEY] == null) {
        return;
      }
      const state = normalizeStoredUpdate(changes[UPDATE_STORAGE_KEY].newValue);
      syncBadge(state, Date.now(), browser);
    });
    const pending = chrome.alarms.get(UPDATE_CHECK_ALARM, (alarm) => {
      consumeRuntimeLastError();
      if (alarm) {
        return;
      }
      finishPromise(
        chrome.alarms.create(
          UPDATE_CHECK_ALARM,
          { periodInMinutes: UPDATE_CHECK_INTERVAL_MS / MINUTE_MS },
          () => {
            consumeRuntimeLastError();
          },
        ),
      );
    });
    finishPromise(pending);
  } catch {
    consumeRuntimeLastError();
  }

  void checkForExtensionUpdate();
}

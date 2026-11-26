import { ChangeDetectionStrategy, Component, OnDestroy, signal } from "@angular/core";

import { BrowserApi } from "../../platform/browser/browser-api";
import {
  AUTHENTICATOR_RELEASE_VERSION,
  CREAM,
  CREAM_LINE,
  INK,
  MUTED,
  TERRACOTTA,
  UPDATE_STEPS,
  UPDATE_STORAGE_KEY,
  detectBrowserKind,
  noticeFor,
  type UpdateNotice,
} from "../../platform/update/extension-update";
import {
  ignoreExtensionUpdate,
  readUpdateState,
  snoozeExtensionUpdate,
} from "../../platform/update/extension-update-background";

/**
 * Cream bar at the top of the popup. The link is a normal click. 稍后 hides
 * the bar until the next local day, and 忽略此版本 hides this version only.
 */
@Component({
  selector: "app-extension-update-banner",
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [":host { display: contents; }"],
  template: `
    @if (notice(); as current) {
      <section
        role="status"
        [style.background]="cream"
        [style.color]="ink"
        [style.border-bottom]="'1px solid ' + line"
        style="padding: 10px 12px 12px"
      >
        <p [style.color]="terracotta" style="margin: 0 0 4px; font-size: 14px; font-weight: 600">
          发现新版本 {{ current.version }}
        </p>
        @if (current.notes) {
          <p [style.color]="ink" style="margin: 0 0 6px; font-size: 12px; line-height: 17px">
            {{ current.notes }}
          </p>
        }
        <p [style.color]="muted" style="margin: 0 0 8px; font-size: 12px; line-height: 17px">
          {{ steps }}
        </p>
        <div style="display: flex; gap: 8px; flex-wrap: wrap">
          <a
            [href]="current.downloadUrl"
            target="_blank"
            rel="noreferrer"
            [style.background]="terracotta"
            [style.color]="cream"
            style="border-radius: 8px; padding: 6px 10px; font-size: 12px; text-decoration: none"
          >
            下载新版
          </a>
          <button
            type="button"
            (click)="snooze()"
            [style.background]="cream"
            [style.color]="ink"
            [style.border]="'1px solid ' + line"
            style="border-radius: 8px; padding: 6px 10px; font-size: 12px; cursor: pointer"
          >
            稍后
          </button>
          <button
            type="button"
            (click)="ignore()"
            [style.background]="cream"
            [style.color]="ink"
            [style.border]="'1px solid ' + line"
            style="border-radius: 8px; padding: 6px 10px; font-size: 12px; cursor: pointer"
          >
            忽略此版本
          </button>
        </div>
      </section>
    }
  `,
})
export class ExtensionUpdateBannerComponent implements OnDestroy {
  protected readonly notice = signal<UpdateNotice | null>(null);
  protected readonly cream = CREAM;
  protected readonly ink = INK;
  protected readonly muted = MUTED;
  protected readonly terracotta = TERRACOTTA;
  protected readonly line = CREAM_LINE;
  protected readonly steps = UPDATE_STEPS;
  private readonly onChanged = (
    changes: Record<string, chrome.storage.StorageChange>,
    area: string,
  ) => {
    if (area === "local" && changes[UPDATE_STORAGE_KEY]) {
      void this.refresh();
    }
  };

  constructor() {
    try {
      BrowserApi.addListener(chrome.storage.onChanged, this.onChanged);
    } catch {
      // A storage listener must not keep the login popup from opening.
    }
    void this.refresh();
  }

  ngOnDestroy(): void {
    BrowserApi.removeListener(chrome.storage.onChanged, this.onChanged);
  }

  protected async snooze(): Promise<void> {
    await snoozeExtensionUpdate();
    await this.refresh();
  }

  protected async ignore(): Promise<void> {
    await ignoreExtensionUpdate();
    await this.refresh();
  }

  private async refresh(): Promise<void> {
    try {
      const state = await readUpdateState();
      this.notice.set(
        noticeFor(
          state,
          AUTHENTICATOR_RELEASE_VERSION,
          Date.now(),
          detectBrowserKind(navigator.userAgent),
        ),
      );
    } catch {
      this.notice.set(null);
    }
  }
}

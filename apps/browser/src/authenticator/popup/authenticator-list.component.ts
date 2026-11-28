import { CdkDragDrop, DragDropModule } from "@angular/cdk/drag-drop";
import { CommonModule } from "@angular/common";
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  ViewEncapsulation,
} from "@angular/core";
import { takeUntilDestroyed, toSignal } from "@angular/core/rxjs-interop";
import { FormsModule } from "@angular/forms";
import { Router } from "@angular/router";
import { firstValueFrom } from "rxjs";

import { JslibModule } from "@bitwarden/angular/jslib.module";
import { AutofillSettingsServiceAbstraction } from "@bitwarden/common/autofill/services/autofill-settings.service";
import { I18nService } from "@bitwarden/common/platform/abstractions/i18n.service";
import { PlatformUtilsService } from "@bitwarden/common/platform/abstractions/platform-utils.service";
import {
  ButtonModule,
  FormFieldModule,
  IconModule,
  MenuModule,
  ToastService,
} from "@bitwarden/components";

import { PopOutComponent } from "../../platform/popup/components/pop-out.component";
import { formatZhDateTime } from "../../platform/popup/format-zh-datetime";
import { PopupHeaderComponent } from "../../platform/popup/layout/popup-header.component";
import { PopupPageComponent } from "../../platform/popup/layout/popup-page.component";
import { parseAuthenticatorImport } from "../authenticator-import";
import { filterAuthenticatorEntries, parseOtpAuthUri } from "../authenticator-otpauth";
import { scanCurrentTabForOtpauth } from "../authenticator-scan";
import { AuthenticatorGroup } from "../authenticator-ui-state";
import { AuthenticatorEntryView } from "../authenticator.models";
import { clipboardClearMs } from "../clipboard-delay";
import {
  applyTotpOrderWrites,
  compareByTotpOrder,
  placementAfterMove,
  TotpOrderIndex,
} from "../totp-order";

import { AuthenticatorCodeComponent } from "./authenticator-code.component";
import { AuthenticatorUiService } from "./authenticator-ui.service";
import { AuthenticatorService, TotpOrderCipherMissingError } from "./authenticator.service";
import { McpAccessService } from "./mcp-access.service";

@Component({
  selector: "app-authenticator-list",
  imports: [
    CommonModule,
    FormsModule,
    JslibModule,
    ButtonModule,
    FormFieldModule,
    IconModule,
    MenuModule,
    DragDropModule,
    PopupPageComponent,
    PopupHeaderComponent,
    PopOutComponent,
    AuthenticatorCodeComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  templateUrl: "./authenticator-list.component.html",
  styles: [
    `
      [data-authenticator-row].cdk-drag-preview {
        scale: 1.02;
        border-radius: 12px;
        border: 1px solid #e4c4b4;
        background: #fffdf9;
        box-shadow: 0 10px 24px rgb(194 85 45 / 0.18);
        cursor: grabbing;
      }
      [data-authenticator-row].cdk-drag-placeholder {
        opacity: 0.4;
        background: rgb(194 85 45 / 0.08);
      }
      [data-authenticator-row].cdk-drag-animating,
      .cdk-drop-list-dragging [data-authenticator-row]:not(.cdk-drag-placeholder) {
        transition: transform 200ms ease;
      }
      @media (prefers-reduced-motion: reduce) {
        [data-authenticator-row].cdk-drag-preview {
          scale: 1;
          box-shadow: none;
        }
        [data-authenticator-row].cdk-drag-animating,
        .cdk-drop-list-dragging [data-authenticator-row]:not(.cdk-drag-placeholder) {
          transition: none;
        }
      }
    `,
  ],
})
export class AuthenticatorListComponent {
  private readonly authenticator = inject(AuthenticatorService);
  private readonly router = inject(Router);
  private readonly platformUtils = inject(PlatformUtilsService);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(I18nService);
  private readonly autofillSettings = inject(AutofillSettingsServiceAbstraction, {
    optional: true,
  });
  protected readonly ui = inject(AuthenticatorUiService);
  private readonly mcp = inject(McpAccessService);
  protected readonly aliases = signal<Record<string, string>>({});
  private readonly codes = new Map<string, string>();

  protected readonly query = signal("");
  protected readonly scanning = signal(false);
  protected readonly scanError = signal<string | null>(null);
  protected readonly busyId = signal<string | null>(null);
  /** Non-zero while the top copy bubble is on screen. The value restarts the slide. */
  protected readonly copyNotice = signal(0);
  /** How long the copy bubble stays before it dismisses itself. */
  protected readonly copyToastMs = AUTHENTICATOR_COPY_TOAST_MS;
  /** Hold this long before a drag starts, so a short click still copies the code. */
  protected readonly dragHoldMs = AUTHENTICATOR_DRAG_HOLD_MS;

  private readonly state = toSignal(this.authenticator.state$, {
    initialValue: {
      status: "loading" as const,
      entries: [] as AuthenticatorEntryView[],
      syncedAt: null as string | null,
    },
  });

  protected readonly status = computed(() => this.state().status);
  protected readonly loading = computed(() => this.status() === "loading");
  protected readonly readOnly = computed(() => this.status() === "offline");
  protected readonly syncedAt = computed(() => this.state().syncedAt ?? null);
  protected readonly recentOnly = this.ui.recentOnly;
  protected readonly orderIndex = signal<TotpOrderIndex>({
    orderBySecret: new Map(),
    secretsWithCipher: new Set(),
  });
  protected readonly visible = computed(() => {
    const filtered = filterAuthenticatorEntries(
      this.state().entries.filter((entry) => !entry.deletedAt),
      this.query(),
      false,
      "manual",
    );
    if (this.ui.recentOnly()) {
      const byId = new Map(filtered.map((entry) => [entry.id, entry]));
      return this.ui
        .recentIds()
        .map((id) => byId.get(id))
        .filter((entry): entry is AuthenticatorEntryView => entry != null);
    }
    return [...filtered].sort((a, b) => compareByTotpOrder(a, b, this.orderIndex().orderBySecret));
  });
  protected readonly groups = computed(() => groupEntries(this.visible(), this.ui.group()));

  constructor() {
    const probe = this.authenticator.confirmServer;
    if (typeof probe === "function") {
      void probe.call(this.authenticator);
    }
    effect(() => {
      this.mcp.aliasEpoch();
      void this.loadAliases();
    });
    // A hub sync bumps syncedAt even when the ciphertext is unchanged, which is how an
    // alias-only change reaches an already open popup.
    this.authenticator.state$.pipe(takeUntilDestroyed()).subscribe(() => {
      void this.loadAliases();
      void this.refreshOrders();
    });
    effect((onCleanup) => {
      const tick = this.copyNotice();
      if (tick === 0) {
        return;
      }
      const timer = setTimeout(() => this.copyNotice.set(0), AUTHENTICATOR_COPY_TOAST_MS);
      onCleanup(() => clearTimeout(timer));
    });
  }

  private async loadAliases(): Promise<void> {
    try {
      this.aliases.set(await this.mcp.authenticatorAliases());
    } catch {
      this.aliases.set({});
    }
  }

  protected rememberCode(id: string, code: string): void {
    this.codes.set(id, code);
  }

  protected rowTitle(entry: AuthenticatorEntryView): string {
    const issuer = entry.issuer?.trim() ?? "";
    const name = entry.name?.trim() ?? "";
    if (issuer && name && issuer !== name) {
      return `${issuer} · ${name}`;
    }
    return issuer || name;
  }

  protected rowNotes(entry: AuthenticatorEntryView): string {
    return entry.notes?.trim() ?? "";
  }

  protected async copy(entry: AuthenticatorEntryView): Promise<void> {
    const value = this.codes.get(entry.id);
    if (!value) {
      return;
    }
    this.copyNotice.update((tick) => tick + 1);
    this.ui.noteRecent(entry.id);
    let clearMs: number | undefined;
    if (this.autofillSettings) {
      try {
        clearMs = clipboardClearMs(
          await firstValueFrom(this.autofillSettings.clearClipboardDelay$),
        );
      } catch {
        clearMs = undefined;
      }
    }
    this.platformUtils.copyToClipboard(value, clearMs ? { clearMs } : undefined);
    if (entry.kind === "hotp" && !this.readOnly()) {
      try {
        await this.authenticator.advanceHotp(entry);
      } catch {
        this.failSave();
      }
    }
  }

  protected add(): void {
    void this.router.navigate(["/authenticator/new"]);
  }

  protected openTools(): void {
    void this.router.navigate(["/authenticator-tools"]);
  }

  protected async scanCurrentPage(): Promise<void> {
    if (this.scanning()) {
      return;
    }
    this.scanning.set(true);
    this.scanError.set(null);
    try {
      const uri = await scanCurrentTabForOtpauth();
      if (!uri) {
        const message = this.i18n.t("authenticatorScanEmpty");
        this.scanError.set(message);
        this.toast.showToast({
          variant: "error",
          title: null,
          message,
        });
        return;
      }
      const imported = parseAuthenticatorImport(uri);
      if (imported.entries.length > 1 || uri.toLowerCase().startsWith("otpauth-migration://")) {
        const saved = await this.authenticator.saveImported(imported.entries);
        this.toast.showToast({
          variant: saved > 0 ? "success" : "error",
          title: null,
          message: this.i18n.t(
            saved > 0 ? "authenticatorImported" : "authenticatorImportEmpty",
            String(saved),
          ),
        });
        return;
      }
      const parsed = parseOtpAuthUri(uri);
      if (!parsed) {
        this.toast.showToast({
          variant: "error",
          title: null,
          message: this.i18n.t("authenticatorInvalidUri"),
        });
        return;
      }
      if (!parsed.name.trim()) {
        const state = await firstValueFrom(this.authenticator.state$);
        parsed.name =
          parsed.issuer ||
          this.i18n.t("authenticatorDefaultName", String(state.entries.length + 1));
      }
      await this.authenticator.save({ ...parsed, notes: "", favorite: false });
      this.toast.showToast({
        variant: "success",
        title: null,
        message: this.i18n.t("authenticatorScanFound"),
      });
    } catch {
      this.toast.showToast({
        variant: "error",
        title: null,
        message: this.i18n.t("serverSaveFailed"),
      });
    } finally {
      this.scanning.set(false);
    }
  }

  /**
   * Custom order on the full list. Search and recent each show a subset, so a
   * midpoint from those neighbors would skip hidden rows.
   */
  protected canReorder(): boolean {
    return this.query().trim() === "" && !this.recentOnly() && !this.readOnly();
  }

  /** Long-press drag follows the flat custom-order list. Grouped rows use the menu. */
  protected canDrag(): boolean {
    return this.canReorder() && this.ui.group() === "none";
  }

  /** Alt+Up and Alt+Down move the focused row. A plain click still copies. */
  protected onRowKey(
    event: KeyboardEvent,
    entry: AuthenticatorEntryView,
    entries: AuthenticatorEntryView[],
    list: HTMLElement,
  ): void {
    if (!event.altKey || event.shiftKey || event.ctrlKey || event.metaKey) {
      return;
    }
    const index = entries.findIndex((item) => item.id === entry.id);
    if (event.key === "ArrowUp" && index > 0) {
      event.preventDefault();
      void this.moveEntry(entry, index - 1, entries, list);
    } else if (event.key === "ArrowDown" && index >= 0 && index < entries.length - 1) {
      event.preventDefault();
      void this.moveEntry(entry, index + 1, entries, list);
    }
  }

  protected isFirst(entry: AuthenticatorEntryView, entries: AuthenticatorEntryView[]): boolean {
    return entries[0]?.id === entry.id;
  }

  protected isLast(entry: AuthenticatorEntryView, entries: AuthenticatorEntryView[]): boolean {
    return entries[entries.length - 1]?.id === entry.id;
  }

  protected async drop(
    event: CdkDragDrop<AuthenticatorEntryView[]>,
    entries: AuthenticatorEntryView[],
  ): Promise<void> {
    if (!this.canDrag() || event.previousIndex === event.currentIndex) {
      return;
    }
    const moved = entries[event.previousIndex];
    if (moved == null) {
      return;
    }
    await this.place(moved, event.currentIndex, entries);
  }

  protected async moveEntry(
    entry: AuthenticatorEntryView,
    destination: number,
    entries: AuthenticatorEntryView[],
    list?: HTMLElement,
  ): Promise<void> {
    const from = entries.findIndex((item) => item.id === entry.id);
    if (from < 0 || from === destination) {
      return;
    }
    await this.place(entry, destination, entries, list);
  }

  protected edit(entry: AuthenticatorEntryView): void {
    if (entry.undecryptable || this.busyId() != null) {
      return;
    }
    void this.router.navigate(["/authenticator", entry.id]);
  }

  protected syncedLabel(): string {
    const value = this.syncedAt();
    if (!value) {
      return "";
    }
    const time = new Date(value);
    if (Number.isNaN(time.getTime())) {
      return "";
    }
    return this.i18n.t("authenticatorSyncedAt", formatZhDateTime(time));
  }

  private async refreshOrders(): Promise<void> {
    try {
      this.orderIndex.set(await this.authenticator.totpOrderIndex());
    } catch {
      // Keep the last index. The list still has a usable order.
    }
  }

  private async place(
    entry: AuthenticatorEntryView,
    destination: number,
    entries: AuthenticatorEntryView[],
    list?: HTMLElement,
  ): Promise<void> {
    if (!this.canReorder() || entry.undecryptable || this.busyId() != null) {
      return;
    }
    const writes = placementAfterMove(entries, entry.id, destination, this.orderIndex());
    if (writes == null) {
      this.toast.showToast({
        variant: "error",
        title: null,
        message: this.i18n.t("authenticatorOrderUnsynced"),
      });
      return;
    }
    if (writes.length === 0) {
      return;
    }
    const previous = this.orderIndex();
    const before = list ? captureRowTops(list) : null;
    this.busyId.set(entry.id);
    this.orderIndex.set(applyTotpOrderWrites(previous, writes));
    if (list && before) {
      this.playSlides(list, before);
    }
    try {
      await this.authenticator.writeTotpOrders(writes);
      await this.refreshOrders();
    } catch (error) {
      const failed = list ? captureRowTops(list) : null;
      this.orderIndex.set(previous);
      if (list && failed) {
        this.playSlides(list, failed);
      }
      if (error instanceof TotpOrderCipherMissingError) {
        this.toast.showToast({
          variant: "error",
          title: null,
          message: this.i18n.t("authenticatorOrderUnsynced"),
        });
      } else {
        this.failSave();
      }
    } finally {
      this.busyId.set(null);
    }
  }

  /** Slides each row from where it was before the order change. Drag uses CDK instead. */
  private playSlides(list: HTMLElement, before: ReadonlyMap<string, number>): void {
    if (prefersReducedMotion()) {
      return;
    }
    requestAnimationFrame(() => {
      const offsets = rowSlideOffsets(before, captureRowTops(list));
      list.querySelectorAll<HTMLElement>("[data-entry-id]").forEach((row) => {
        const id = row.dataset.entryId;
        const dy = id ? offsets.get(id) : undefined;
        if (dy == null) {
          return;
        }
        row.style.transition = "none";
        row.style.transform = `translateY(${dy}px)`;
        requestAnimationFrame(() => {
          row.style.transition = "transform 200ms ease";
          row.style.transform = "";
          const clear = () => {
            row.style.transition = "";
            row.removeEventListener("transitionend", clear);
          };
          row.addEventListener("transitionend", clear);
        });
      });
    });
  }

  private failSave(): void {
    this.toast.showToast({
      variant: "error",
      title: null,
      message: this.i18n.t("serverSaveFailed"),
    });
  }
}

/** Press-and-hold before a row can be dragged. Shorter presses stay clicks. */
export const AUTHENTICATOR_DRAG_HOLD_MS = 400;

/** The top copy bubble stays on screen for this long. */
export const AUTHENTICATOR_COPY_TOAST_MS = 1500;

function groupEntries(
  entries: AuthenticatorEntryView[],
  mode: AuthenticatorGroup,
): { title: string; entries: AuthenticatorEntryView[] }[] {
  if (mode === "none") {
    return [{ title: "", entries }];
  }
  const groups = new Map<string, AuthenticatorEntryView[]>();
  for (const entry of entries) {
    const titles =
      mode === "tag"
        ? entry.tags && entry.tags.length > 0
          ? entry.tags
          : ["未分组"]
        : [entry.issuer || "未分组"];
    for (const title of titles) {
      const list = groups.get(title) ?? [];
      list.push(entry);
      groups.set(title, list);
    }
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b, "zh"))
    .map(([title, grouped]) => ({ title, entries: grouped }));
}

function prefersReducedMotion(): boolean {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function captureRowTops(list: HTMLElement): Map<string, number> {
  const tops = new Map<string, number>();
  list.querySelectorAll<HTMLElement>("[data-entry-id]").forEach((row) => {
    const id = row.dataset.entryId;
    if (id) {
      tops.set(id, row.getBoundingClientRect().top);
    }
  });
  return tops;
}

/** How far each row must travel so a reorder can slide instead of jumping. */
export function rowSlideOffsets(
  before: ReadonlyMap<string, number>,
  after: ReadonlyMap<string, number>,
): Map<string, number> {
  const offsets = new Map<string, number>();
  after.forEach((top, id) => {
    const previous = before.get(id);
    if (previous == null) {
      return;
    }
    const dy = previous - top;
    if (Math.abs(dy) >= 1) {
      offsets.set(id, dy);
    }
  });
  return offsets;
}

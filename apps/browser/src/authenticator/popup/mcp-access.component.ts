import { CommonModule } from "@angular/common";
import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from "@angular/core";
import { firstValueFrom } from "rxjs";

import { JslibModule } from "@bitwarden/angular/jslib.module";
import { I18nService } from "@bitwarden/common/platform/abstractions/i18n.service";
import { PlatformUtilsService } from "@bitwarden/common/platform/abstractions/platform-utils.service";
import { ButtonModule, CalloutModule, ToastService } from "@bitwarden/components";

import { PopOutComponent } from "../../platform/popup/components/pop-out.component";
import { PopupHeaderComponent } from "../../platform/popup/layout/popup-header.component";
import { PopupPageComponent } from "../../platform/popup/layout/popup-page.component";

import { AuthenticatorService, draftFromView } from "./authenticator.service";
import { McpAccessService } from "./mcp-access.service";

@Component({
  selector: "app-mcp-access",
  imports: [
    CommonModule,
    JslibModule,
    ButtonModule,
    CalloutModule,
    PopupPageComponent,
    PopupHeaderComponent,
    PopOutComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: "./mcp-access.component.html",
})
export class McpAccessComponent implements OnInit {
  private readonly mcp = inject(McpAccessService);
  private readonly authenticator = inject(AuthenticatorService);
  private readonly platformUtils = inject(PlatformUtilsService);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(I18nService);

  protected readonly loading = signal(true);
  protected readonly busy = signal(false);
  protected readonly unsupported = signal(false);
  protected readonly configured = signal(false);
  protected readonly entryCount = signal(0);
  /** Shown only until the user leaves this page. */
  protected readonly revealedToken = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly rewrapNote = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    await this.reload();
  }

  protected async create(): Promise<void> {
    await this.issue(false);
  }

  protected async rotate(): Promise<void> {
    if (!confirm(this.i18n.t("mcpRotateConfirm"))) {
      return;
    }
    await this.issue(true);
  }

  protected async revoke(): Promise<void> {
    if (!confirm(this.i18n.t("mcpRevokeConfirm"))) {
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.mcp.revokeToken();
      this.revealedToken.set(null);
      this.configured.set(false);
      this.entryCount.set(0);
    } catch {
      this.error.set(this.i18n.t("mcpActionError"));
    } finally {
      this.busy.set(false);
    }
  }

  protected copy(): void {
    const token = this.revealedToken();
    if (!token) {
      return;
    }
    this.platformUtils.copyToClipboard(token);
    this.toast.showToast({
      variant: "success",
      title: null,
      message: this.i18n.t("mcpTokenCopied"),
    });
  }

  private async reload(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const status = await this.mcp.status();
      if (status === "unsupported") {
        this.unsupported.set(true);
        return;
      }
      this.unsupported.set(false);
      this.configured.set(status.configured);
      this.entryCount.set(status.entryCount ?? 0);
    } catch {
      this.error.set(this.i18n.t("mcpActionError"));
    } finally {
      this.loading.set(false);
    }
  }

  private async issue(rotating: boolean): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    this.rewrapNote.set(null);
    try {
      if (rotating) {
        const issued = await this.mcp.rotateToken();
        const missed = await this.rewrap(issued.cleared);
        this.revealedToken.set(issued.token);
        this.configured.set(true);
        if (missed.length > 0) {
          this.rewrapNote.set(this.i18n.t("mcpRewrapMissed", missed.join("、")));
        }
      } else {
        this.revealedToken.set(await this.mcp.createToken());
        this.configured.set(true);
      }
      const status = await this.mcp.status();
      if (status !== "unsupported") {
        this.entryCount.set(status.entryCount ?? 0);
      }
    } catch {
      this.error.set(this.i18n.t("mcpActionError"));
    } finally {
      this.busy.set(false);
    }
  }

  private async rewrap(cleared: Array<{ source: string; sourceId: string; alias: string }>): Promise<string[]> {
    const missed: string[] = [];
    const state = await firstValueFrom(this.authenticator.state$);
    for (const item of cleared) {
      if (item.source !== "authenticator") {
        missed.push(item.alias);
        continue;
      }
      const entry = state.entries.find((candidate) => candidate.id === item.sourceId);
      if (entry == null || entry.undecryptable) {
        missed.push(item.alias);
        continue;
      }
      const draft = draftFromView(entry);
      try {
        await this.mcp.upsertAuthenticator({
          sourceId: entry.id,
          alias: item.alias,
          secret: draft.secret,
          issuer: draft.issuer,
          account: draft.name,
          algorithm: draft.algorithm,
          digits: draft.digits,
          period: draft.period,
          steam: draft.digits === 5,
        });
      } catch {
        missed.push(item.alias);
      }
    }
    return missed;
  }
}

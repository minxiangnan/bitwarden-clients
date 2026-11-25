import { CommonModule } from "@angular/common";
import { ChangeDetectionStrategy, Component, inject, signal } from "@angular/core";
import { firstValueFrom } from "rxjs";

import { JslibModule } from "@bitwarden/angular/jslib.module";
import { AccountService } from "@bitwarden/common/auth/abstractions/account.service";
import { CipherService } from "@bitwarden/common/vault/abstractions/cipher.service";
import { CipherType } from "@bitwarden/common/vault/enums/cipher-type";
import { ButtonModule } from "@bitwarden/components";

import { PopupHeaderComponent } from "../../platform/popup/layout/popup-header.component";
import { PopupPageComponent } from "../../platform/popup/layout/popup-page.component";
import {
  classifyPasswords,
  lookupExposedCounts,
  PasswordHealthRow,
} from "../password-health";

@Component({
  selector: "app-password-health",
  imports: [CommonModule, JslibModule, ButtonModule, PopupPageComponent, PopupHeaderComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <popup-page>
      <popup-header slot="header" [pageTitle]="'passwordHealth' | i18n" showBackButton></popup-header>
      <p class="tw-mb-3 tw-text-sm tw-text-muted">{{ "passwordHealthHelp" | i18n }}</p>
      <div class="tw-mb-3 tw-flex tw-flex-wrap tw-gap-2">
        <button type="button" bitButton buttonType="primary" [disabled]="busy()" (click)="scan(false)">
          {{ "passwordHealthLocal" | i18n }}
        </button>
        <button type="button" bitButton buttonType="secondary" [disabled]="busy()" (click)="scan(true)">
          {{ "passwordHealthExposed" | i18n }}
        </button>
      </div>
      @if (busy()) {
        <p class="tw-mb-3 tw-text-sm tw-text-muted" role="status">{{ "passwordHealthBusy" | i18n }}</p>
      }
      @if (error()) {
        <p class="tw-mb-3 tw-text-sm tw-text-danger" role="alert">{{ error() }}</p>
      }
      @if (rows(); as list) {
        @if (issueCount() === 0) {
          <p class="tw-text-sm tw-text-main">{{ "passwordHealthClear" | i18n }}</p>
        } @else {
        <p class="tw-mb-2 tw-text-sm">
          {{ "passwordHealthWeak" | i18n }} {{ weakCount() }} · {{ "passwordHealthReused" | i18n }}
          {{ reusedCount() }}
          @if (checkedExposed()) {
            · {{ "passwordHealthLeaked" | i18n }} {{ leakedCount() }}
          }
        </p>
        <ul class="tw-m-0 tw-list-none tw-p-0">
          @for (row of list; track row.id) {
            @if (row.weak || row.reused || (row.exposedCount ?? 0) > 0) {
              <li class="tw-mb-2 tw-rounded-lg tw-border tw-border-solid tw-border-secondary-100 tw-bg-background-alt tw-p-2 tw-text-sm">
                <span class="tw-font-semibold">{{ row.name }}</span>
                @if (row.username) {
                  <span class="tw-text-muted"> · {{ row.username }}</span>
                }
                <span class="tw-mt-1 tw-block tw-text-xs tw-text-muted">
                  @if (row.weak) {
                    <span>{{ "passwordHealthWeak" | i18n }} </span>
                  }
                  @if (row.reused) {
                    <span>{{ "passwordHealthReused" | i18n }} </span>
                  }
                  @if ((row.exposedCount ?? 0) > 0) {
                    <span>{{ "passwordHealthLeaked" | i18n }} {{ row.exposedCount }}</span>
                  }
                </span>
              </li>
            }
          }
        </ul>
        }
      }
    </popup-page>
  `,
})
export class PasswordHealthComponent {
  private readonly ciphers = inject(CipherService);
  private readonly accounts = inject(AccountService);

  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly rows = signal<PasswordHealthRow[] | null>(null);
  protected readonly weakCount = signal(0);
  protected readonly reusedCount = signal(0);
  protected readonly leakedCount = signal(0);
  protected readonly checkedExposed = signal(false);
  protected readonly issueCount = signal(0);

  protected async scan(includeExposed: boolean): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      const account = await firstValueFrom(this.accounts.activeAccount$);
      if (account?.id == null) {
        return;
      }
      const vault = await this.ciphers.getAllDecrypted(account.id);
      const secrets = vault
        .filter((cipher) => cipher.type === CipherType.Login && cipher.login?.password)
        .map((cipher) => ({
          id: cipher.id,
          name: cipher.name ?? "",
          username: cipher.login?.username ?? "",
          password: cipher.login?.password ?? "",
        }));
      let rows = classifyPasswords(secrets);
      if (includeExposed) {
        const counts = await lookupExposedCounts(
          secrets.map((item) => item.password),
          async (prefix) => {
            const response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
              headers: { "Add-Padding": "true" },
            });
            if (!response.ok) {
              throw new Error(String(response.status));
            }
            return response.text();
          },
        );
        const byPassword = new Map(secrets.map((item) => [item.id, item.password]));
        rows = rows.map((row) => ({
          ...row,
          exposedCount: counts.get(byPassword.get(row.id) ?? "") ?? 0,
        }));
      }
      this.rows.set(rows);
      this.checkedExposed.set(includeExposed);
      this.weakCount.set(rows.filter((row) => row.weak).length);
      this.reusedCount.set(rows.filter((row) => row.reused).length);
      this.leakedCount.set(rows.filter((row) => (row.exposedCount ?? 0) > 0).length);
      this.issueCount.set(
        rows.filter((row) => row.weak || row.reused || (row.exposedCount ?? 0) > 0).length,
      );
    } catch {
      this.error.set("检查没有完成。泄露查询需要能访问 api.pwnedpasswords.com。");
    } finally {
      this.busy.set(false);
    }
  }
}

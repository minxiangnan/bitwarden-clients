import { CommonModule } from "@angular/common";
import { ChangeDetectionStrategy, Component, effect, inject, input, output } from "@angular/core";
import { toObservable, toSignal } from "@angular/core/rxjs-interop";
import { from, map, of, startWith, switchMap, timer } from "rxjs";

import { TotpService } from "@bitwarden/common/vault/abstractions/totp.service";

import {
  entryKind,
  formatAuthenticatorCode,
  hotpCode,
  nextTotpCode,
  steamCode,
} from "../authenticator-codes";
import { AuthenticatorKinds } from "../authenticator-meta";
import { toOtpAuthUri } from "../authenticator-otpauth";
import { AuthenticatorEntryView } from "../authenticator.models";

@Component({
  selector: "app-authenticator-code",
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (info(); as totp) {
      <span class="tw-flex tw-items-center tw-gap-2">
        <span class="tw-block">
          <span class="tw-font-mono tw-text-3xl tw-font-medium tw-tabular-nums tw-tracking-[0.18em] tw-text-main">{{ totp.formatted }}</span>
          @if (totp.nextFormatted) {
            <span class="tw-mt-1 tw-block tw-text-xs tw-text-muted">
              下一段
              <span class="tw-font-mono tw-tracking-[0.14em]">{{ totp.nextFormatted }}</span>
            </span>
          }
        </span>
        @if (totp.seconds > 0) {
        <span
          class="tw-relative tw-flex tw-size-7 tw-items-center tw-justify-center"
          aria-hidden="true"
        >
          <span class="tw-absolute tw-text-[10px]" [class.tw-text-danger]="totp.low">{{
            totp.seconds
          }}</span>
          <svg class="tw-size-7" transform="rotate(-90)" viewBox="0 0 28 28">
            <circle
              class="tw-fill-none"
              [class.tw-stroke-danger-600]="totp.low"
              [class.tw-stroke-primary-600]="!totp.low"
              r="11"
              cy="14"
              cx="14"
              stroke-width="2"
              stroke-dasharray="69"
              [style.stroke-dashoffset.px]="totp.offset"
            ></circle>
          </svg>
        </span>
        }
      </span>
    }
  `,
})
export class AuthenticatorCodeComponent {
  private readonly totpService = inject(TotpService);

  readonly entry = input.required<AuthenticatorEntryView>();
  readonly codeChange = output<string>();

  private readonly info$ = toObservable(this.entry).pipe(
    switchMap((entry) => {
      if (!entry.secret) {
        return of(null);
      }
      const kind = entryKind(entry);
      if (kind === AuthenticatorKinds.Steam || kind === AuthenticatorKinds.Hotp) {
        return timer(0, 1000).pipe(switchMap(() => from(this.localCode(entry, kind))));
      }
      return this.totpService.getCode$(toOtpAuthUri(entry)).pipe(
        switchMap((response) => {
          const period = response.period || entry.period || 30;
          const elapsed = Math.floor(Date.now() / 1000) % period;
          const seconds = period - elapsed;
          const current = {
            code: response.code,
            formatted: formatAuthenticatorCode(response.code),
            nextFormatted: "",
            seconds,
            low: seconds <= 7,
            offset: Math.round((elapsed / period) * 69),
          };
          return from(nextTotpCode(entry, Date.now()).catch((): null => null)).pipe(
            map((next) => ({
              ...current,
              nextFormatted: next ? formatAuthenticatorCode(next) : "",
            })),
            startWith(current),
          );
        }),
      );
    }),
  );

  private async localCode(
    entry: AuthenticatorEntryView,
    kind: typeof AuthenticatorKinds.Steam | typeof AuthenticatorKinds.Hotp,
  ): Promise<{
    code: string;
    formatted: string;
    nextFormatted: string;
    seconds: number;
    low: boolean;
    offset: number;
  }> {
    const now = Date.now();
    if (kind === AuthenticatorKinds.Steam) {
      const code = (await steamCode(entry.secret, now)) ?? "";
      const period = 30;
      const elapsed = Math.floor(now / 1000) % period;
      const seconds = period - elapsed;
      return {
        code,
        formatted: code,
        nextFormatted: "",
        seconds,
        low: seconds <= 7,
        offset: Math.round((elapsed / period) * 69),
      };
    }
    const code =
      (await hotpCode(entry.secret, entry.counter ?? 0, entry.digits || 6, entry.algorithm)) ?? "";
    return {
      code,
      formatted: formatAuthenticatorCode(code),
      nextFormatted: "",
      seconds: 0,
      low: false,
      offset: 0,
    };
  }

  protected readonly info = toSignal(this.info$);

  constructor() {
    effect(() => {
      const code = this.info()?.code;
      if (code) {
        this.codeChange.emit(code);
      }
    });
  }
}

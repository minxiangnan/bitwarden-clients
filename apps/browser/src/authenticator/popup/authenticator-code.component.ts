import { CommonModule } from "@angular/common";
import { ChangeDetectionStrategy, Component, effect, inject, input, output } from "@angular/core";
import { toObservable, toSignal } from "@angular/core/rxjs-interop";
import { map, of, switchMap } from "rxjs";

import { TotpService } from "@bitwarden/common/vault/abstractions/totp.service";

import { toOtpAuthUri } from "../authenticator-otpauth";
import { AuthenticatorEntryView } from "../authenticator.models";

@Component({
  selector: "app-authenticator-code",
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (info(); as totp) {
      <span class="tw-flex tw-items-center tw-gap-2">
        <span class="tw-font-mono tw-text-2xl tw-tracking-widest">{{ totp.formatted }}</span>
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
      return this.totpService.getCode$(toOtpAuthUri(entry)).pipe(
        map((response) => {
          const period = response.period || entry.period || 30;
          const elapsed = Math.floor(Date.now() / 1000) % period;
          const seconds = period - elapsed;
          const half = Math.floor(response.code.length / 2);
          return {
            code: response.code,
            formatted:
              response.code.length > 4
                ? `${response.code.slice(0, half)} ${response.code.slice(half)}`
                : response.code,
            seconds,
            low: seconds <= 7,
            offset: Math.round((elapsed / period) * 69),
          };
        }),
      );
    }),
  );

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

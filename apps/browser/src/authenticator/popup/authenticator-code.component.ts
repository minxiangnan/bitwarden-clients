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

type CodeFace = {
  code: string;
  formatted: string;
  nextFormatted: string;
  seconds: number;
  showNext: boolean;
  low: boolean;
  /** Share of the period still left, from 0 to 1. */
  remaining: number;
  /** True when a new period starts, so the bar jumps instead of animating backward. */
  reset: boolean;
};

/** Remaining time for one TOTP step. A period of 0 is a code with no countdown. */
export function codeFace(code: string, period: number, nextFormatted: string): CodeFace {
  if (period <= 0) {
    return {
      code,
      formatted: formatAuthenticatorCode(code),
      nextFormatted,
      seconds: 0,
      showNext: false,
      low: false,
      remaining: 0,
      reset: false,
    };
  }
  const elapsed = Math.floor(Date.now() / 1000) % period;
  const seconds = period - elapsed;
  return {
    code,
    formatted: formatAuthenticatorCode(code),
    nextFormatted,
    seconds,
    showNext: seconds > 0 && seconds <= 5,
    low: seconds <= 5,
    remaining: seconds / period,
    reset: false,
  };
}

@Component({
  selector: "app-authenticator-code",
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (info(); as totp) {
      <span data-zh-code-block>
        <span
          data-zh-code
          class="tw-font-mono tw-text-lg tw-font-medium tw-leading-5 tw-tabular-nums tw-tracking-[0.06em]"
          >{{ totp.formatted }}</span
        >
        @if (totp.seconds > 0) {
          <span data-zh-countdown [attr.data-zh-urgent]="totp.low ? '' : null" aria-hidden="true">
            <span data-zh-countdown-track>
              <span
                data-zh-countdown-fill
                [style.width.%]="totp.remaining * 100"
                [attr.data-zh-reset]="totp.reset ? '' : null"
              ></span>
            </span>
            <span data-zh-countdown-seconds>{{ totp.seconds }}</span>
          </span>
        }
        @if (totp.showNext && totp.nextFormatted) {
          <span data-zh-next class="tw-text-[10px] tw-leading-3 tw-text-muted">
            下一段
            <span class="tw-font-mono tw-tracking-[0.06em]">{{ totp.nextFormatted }}</span>
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
      let previous = -1;
      const mark = (face: CodeFace) => {
        face.reset = previous >= 0 && face.remaining > previous + 0.02;
        previous = face.remaining;
        return face;
      };
      const kind = entryKind(entry);
      if (kind === AuthenticatorKinds.Steam || kind === AuthenticatorKinds.Hotp) {
        return timer(0, 1000).pipe(
          switchMap(() => from(this.localCode(entry, kind))),
          map((face) => mark(face)),
        );
      }
      return this.totpService.getCode$(toOtpAuthUri(entry)).pipe(
        switchMap((response) => {
          const period = response.period || entry.period || 30;
          return from(nextTotpCode(entry, Date.now()).catch((): null => null)).pipe(
            switchMap((next) =>
              timer(0, 1000).pipe(
                map(() =>
                  mark(codeFace(response.code, period, next ? formatAuthenticatorCode(next) : "")),
                ),
              ),
            ),
            startWith(mark(codeFace(response.code, period, ""))),
          );
        }),
      );
    }),
  );

  private async localCode(
    entry: AuthenticatorEntryView,
    kind: typeof AuthenticatorKinds.Steam | typeof AuthenticatorKinds.Hotp,
  ): Promise<CodeFace> {
    const now = Date.now();
    if (kind === AuthenticatorKinds.Steam) {
      const code = (await steamCode(entry.secret, now)) ?? "";
      return { ...codeFace(code, 30, ""), formatted: code };
    }
    const code =
      (await hotpCode(entry.secret, entry.counter ?? 0, entry.digits || 6, entry.algorithm)) ?? "";
    return codeFace(code, 0, "");
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

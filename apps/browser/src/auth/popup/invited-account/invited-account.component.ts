import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  signal,
  viewChild,
} from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { ActivatedRoute, Router, RouterModule } from "@angular/router";
import { filter, firstValueFrom } from "rxjs";

import { RegistrationFinishService } from "@bitwarden/angular/auth/registration";
import { JslibModule } from "@bitwarden/angular/jslib.module";
import {
  InputPasswordComponent,
  InputPasswordFlow,
  PasswordInputResult,
} from "@bitwarden/auth/angular";
import { LoginEmailServiceAbstraction } from "@bitwarden/auth/common";
import { AccountApiService } from "@bitwarden/common/auth/abstractions/account-api.service";
import { RegisterSendVerificationEmailRequest } from "@bitwarden/common/auth/models/request/registration/register-send-verification-email.request";
import {
  EnvironmentService,
  Region,
} from "@bitwarden/common/platform/abstractions/environment.service";
import { I18nService } from "@bitwarden/common/platform/abstractions/i18n.service";
import { describeServerUrl } from "@bitwarden/common/platform/misc/server-url";
import { FormFieldModule, LinkModule, ToastService } from "@bitwarden/components";

import { invitedAccountErrorText } from "./invited-account-error";

@Component({
  selector: "app-invited-account",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormFieldModule, InputPasswordComponent, JslibModule, LinkModule, RouterModule],
  templateUrl: "./invited-account.component.html",
})
export class InvitedAccountComponent {
  private readonly accountApi = inject(AccountApiService);
  private readonly environment = inject(EnvironmentService);
  private readonly i18n = inject(I18nService);
  private readonly loginEmail = inject(LoginEmailServiceAbstraction);
  private readonly registration = inject(RegistrationFinishService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  private readonly serverUrlField = viewChild<ElementRef<HTMLInputElement>>("serverUrlField");
  private readonly serverUrlTouched = signal(false);

  readonly registrationFlow = InputPasswordFlow.SetInitialPasswordAccountRegistration;
  readonly serverUrl = signal("");
  readonly email = signal("");
  readonly name = signal("");
  readonly error = signal("");
  readonly busy = signal(false);

  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      const server = params.get("server");
      if (server && !this.serverUrlTouched()) {
        this.applyServerUrl(server);
      }
    });
    void this.rememberedServer();
  }

  onServerUrl(value: string): void {
    this.serverUrlTouched.set(true);
    this.serverUrl.set(value);
    this.error.set("");
  }

  onEmail(value: string): void {
    this.email.set(value);
    this.error.set("");
  }

  onName(value: string): void {
    this.name.set(value);
  }

  async submit(password: PasswordInputResult): Promise<void> {
    const verdict = describeServerUrl(this.serverUrl());
    if (verdict.status !== "ok") {
      this.error.set(this.serverUrlMessage(verdict.status));
      return;
    }
    const email = this.email().trim();
    if (!email.includes("@")) {
      this.error.set("请填写受邀邮箱。");
      return;
    }

    this.busy.set(true);
    this.error.set("");
    try {
      await this.environment.setEnvironment(Region.SelfHosted, { base: verdict.base });
      await firstValueFrom(
        this.environment.environment$.pipe(
          filter((env) => env.getIdentityUrl().startsWith(verdict.base)),
        ),
      );
      const trimmedName = this.name().trim();
      const token = await this.accountApi.registerSendVerificationEmail(
        new RegisterSendVerificationEmailRequest(
          email,
          trimmedName === "" ? null : trimmedName,
          false,
        ),
      );
      if (typeof token !== "string" || token.length === 0) {
        this.error.set(
          "服务器要求先验证邮箱。这个扩展没有网页保险箱，请让管理员关闭邮箱验证后再创建。",
        );
        return;
      }
      await this.registration.finishRegistration(email, password, token);
      await this.loginEmail.setLoginEmail(email);
      await this.loginEmail.setRememberedEmailChoice(email, true);
      this.toast.showToast({
        variant: "success",
        title: null,
        message: "账户已创建，请登录。",
      });
      await this.router.navigate(["/login"]);
    } catch (error) {
      this.error.set(invitedAccountErrorText(error));
    } finally {
      this.busy.set(false);
    }
  }

  private async rememberedServer(): Promise<void> {
    const env = await firstValueFrom(this.environment.environment$);
    const remembered = env.getUrls()?.base ?? "";
    if (!this.serverUrlTouched() && remembered) {
      this.applyServerUrl(remembered);
    }
  }

  private applyServerUrl(value: string): void {
    this.serverUrl.set(value);
    const field = this.serverUrlField()?.nativeElement;
    if (field && field.value !== value) {
      field.value = value;
    }
  }

  private serverUrlMessage(reason: "empty" | "invalid" | "https"): string {
    if (reason === "empty") {
      return this.i18n.t("serverUrlRequired");
    }
    if (reason === "invalid") {
      return this.i18n.t("serverUrlInvalid");
    }
    return this.i18n.t("serverUrlMustUseHttps");
  }
}

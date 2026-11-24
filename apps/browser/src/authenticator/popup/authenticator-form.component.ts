import { CommonModule } from "@angular/common";
import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from "@angular/core";
import { FormBuilder, ReactiveFormsModule, Validators } from "@angular/forms";
import { ActivatedRoute, Router } from "@angular/router";
import { firstValueFrom } from "rxjs";

import { JslibModule } from "@bitwarden/angular/jslib.module";
import { I18nService } from "@bitwarden/common/platform/abstractions/i18n.service";
import { ButtonModule, FormFieldModule, ToastService } from "@bitwarden/components";

import { PopOutComponent } from "../../platform/popup/components/pop-out.component";
import { PopupHeaderComponent } from "../../platform/popup/layout/popup-header.component";
import { PopupPageComponent } from "../../platform/popup/layout/popup-page.component";
import { isValidTotpSecret, normalizeTotpSecret, parseOtpAuthUri } from "../authenticator-otpauth";
import { scanCurrentTabForOtpauth } from "../authenticator-scan";
import {
  AuthenticatorAlgorithm,
  AuthenticatorAlgorithms,
  DEFAULT_AUTHENTICATOR_DIGITS,
  DEFAULT_AUTHENTICATOR_PERIOD,
  MAX_AUTHENTICATOR_DIGITS,
  MAX_AUTHENTICATOR_PERIOD,
  MIN_AUTHENTICATOR_DIGITS,
  MIN_AUTHENTICATOR_PERIOD,
} from "../authenticator.models";
import { normalizeAlias } from "../mcp/mcp-crypto";

import { AuthenticatorDraft, AuthenticatorService, draftFromView } from "./authenticator.service";
import { McpAccessService } from "./mcp-access.service";

@Component({
  selector: "app-authenticator-form",
  imports: [
    CommonModule,
    ReactiveFormsModule,
    JslibModule,
    ButtonModule,
    FormFieldModule,
    PopupPageComponent,
    PopupHeaderComponent,
    PopOutComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: "./authenticator-form.component.html",
})
export class AuthenticatorFormComponent implements OnInit {
  private readonly authenticator = inject(AuthenticatorService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly formBuilder = inject(FormBuilder);
  private readonly i18n = inject(I18nService);
  private readonly toast = inject(ToastService);
  private readonly mcp = inject(McpAccessService);
  private readonly mcpWasEnabled = signal(false);

  protected readonly algorithms = [
    AuthenticatorAlgorithms.Sha1,
    AuthenticatorAlgorithms.Sha256,
    AuthenticatorAlgorithms.Sha512,
  ];
  protected readonly canScan = true;
  protected readonly minDigits = MIN_AUTHENTICATOR_DIGITS;
  protected readonly maxDigits = MAX_AUTHENTICATOR_DIGITS;
  protected readonly minPeriod = MIN_AUTHENTICATOR_PERIOD;
  protected readonly maxPeriod = MAX_AUTHENTICATOR_PERIOD;
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly scanning = signal(false);
  protected readonly advancedOpen = signal(false);
  protected readonly otpType = signal<"totp" | "steam">("totp");
  protected readonly editing = signal(false);
  protected readonly errorKey = signal<string | null>(null);
  protected readonly titleKey = signal("authenticatorAdd");

  protected readonly form = this.formBuilder.nonNullable.group({
    name: [""],
    issuer: [""],
    secret: ["", Validators.required],
    algorithm: [AuthenticatorAlgorithms.Sha1 as AuthenticatorAlgorithm],
    digits: [
      DEFAULT_AUTHENTICATOR_DIGITS,
      [
        Validators.required,
        Validators.min(MIN_AUTHENTICATOR_DIGITS),
        Validators.max(MAX_AUTHENTICATOR_DIGITS),
      ],
    ],
    period: [
      DEFAULT_AUTHENTICATOR_PERIOD,
      [
        Validators.required,
        Validators.min(MIN_AUTHENTICATOR_PERIOD),
        Validators.max(MAX_AUTHENTICATOR_PERIOD),
      ],
    ],
    notes: [""],
    favorite: [false],
    mcpEnabled: [false],
    mcpAlias: [""],
  });

  private readonly entryId = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.paramMap.get("id");
    if (!id) {
      return;
    }
    this.entryId.set(id);
    this.editing.set(true);
    this.advancedOpen.set(true);
    this.titleKey.set("authenticatorEdit");
    this.loading.set(true);
    const state = await firstValueFrom(this.authenticator.state$);
    const entry = state.entries.find((item) => item.id === id);
    this.loading.set(false);
    if (!entry) {
      this.errorKey.set("authenticatorMissing");
      return;
    }
    if (entry.undecryptable) {
      this.errorKey.set("authenticatorUndecryptable");
      this.form.disable();
      return;
    }
    this.form.patchValue(draftFromView(entry));
    this.otpType.set(entry.digits === MIN_AUTHENTICATOR_DIGITS ? "steam" : "totp");
    const grant = await this.mcp.findAuthenticator(id);
    if (grant) {
      this.mcpWasEnabled.set(true);
      this.form.patchValue({ mcpEnabled: true, mcpAlias: grant.alias });
    }
  }

  protected setOtpType(value: string): void {
    const type = value === "steam" ? "steam" : "totp";
    this.otpType.set(type);
    if (type === "steam") {
      this.form.patchValue({
        algorithm: AuthenticatorAlgorithms.Sha1,
        digits: MIN_AUTHENTICATOR_DIGITS,
      });
    } else if (this.form.controls.digits.value === MIN_AUTHENTICATOR_DIGITS) {
      this.form.controls.digits.setValue(DEFAULT_AUTHENTICATOR_DIGITS);
    }
  }

  protected onSecretPaste(event: ClipboardEvent): void {
    const text = event.clipboardData?.getData("text") ?? "";
    if (!text.trim()) {
      return;
    }
    event.preventDefault();
    void this.acceptInput(text, !this.editing());
  }

  protected async submit(): Promise<void> {
    if (this.form.invalid || this.saving()) {
      return;
    }
    const rawSecret = this.form.controls.secret.value.trim();
    if (rawSecret.toLowerCase().startsWith("otpauth://")) {
      const parsed = parseOtpAuthUri(rawSecret);
      if (!parsed) {
        this.errorKey.set("authenticatorInvalidUri");
        return;
      }
      this.form.patchValue(parsed);
    }
    const draft = this.form.getRawValue() satisfies AuthenticatorDraft;
    draft.secret = normalizeTotpSecret(draft.secret);
    if (!isValidTotpSecret(draft.secret)) {
      this.errorKey.set("authenticatorSecretInvalid");
      return;
    }
    if (!draft.name.trim()) {
      draft.name = await this.defaultName();
    }
    const mcpEnabled = this.form.controls.mcpEnabled.value;
    const alias = normalizeAlias(this.form.controls.mcpAlias.value);
    if (mcpEnabled && alias == null) {
      this.errorKey.set(
        this.form.controls.mcpAlias.value.trim() ? "mcpAliasInvalid" : "mcpAliasRequired",
      );
      return;
    }
    if (mcpEnabled && !(await this.mcp.hasToken())) {
      this.errorKey.set("mcpNeedToken");
      return;
    }
    this.saving.set(true);
    this.errorKey.set(null);
    try {
      const savedId = await this.authenticator.save(draft, this.entryId() ?? undefined);
      const entryId = this.entryId() ?? savedId;
      if (mcpEnabled && alias && entryId) {
        await this.mcp.upsertAuthenticator({
          sourceId: entryId,
          alias,
          secret: draft.secret,
          issuer: draft.issuer.trim(),
          account: draft.name.trim(),
          algorithm: draft.algorithm,
          digits: draft.digits,
          period: draft.period,
          steam: this.otpType() === "steam",
        });
      } else if (!mcpEnabled && this.mcpWasEnabled() && entryId) {
        await this.mcp.disableAuthenticator(entryId);
      }
      await this.router.navigate(["/tabs/authenticator"]);
    } catch {
      this.errorKey.set("authenticatorSaveError");
      this.toast.showToast({
        variant: "error",
        title: null,
        message: this.i18n.t("serverSaveFailed"),
      });
    } finally {
      this.saving.set(false);
    }
  }

  protected async scan(): Promise<void> {
    this.scanning.set(true);
    this.errorKey.set(null);
    try {
      const uri = await scanCurrentTabForOtpauth();
      if (!uri) {
        this.errorKey.set("authenticatorScanEmpty");
        return;
      }
      await this.acceptInput(uri, !this.editing());
    } finally {
      this.scanning.set(false);
    }
  }

  private async acceptInput(value: string, saveNow: boolean): Promise<void> {
    const trimmed = value.trim();
    if (trimmed.toLowerCase().startsWith("otpauth://")) {
      const parsed = parseOtpAuthUri(trimmed);
      if (!parsed) {
        this.errorKey.set("authenticatorInvalidUri");
        return;
      }
      this.errorKey.set(null);
      this.otpType.set(parsed.digits === MIN_AUTHENTICATOR_DIGITS ? "steam" : "totp");
      this.form.patchValue(parsed);
    } else {
      const secret = normalizeTotpSecret(trimmed);
      this.form.controls.secret.setValue(secret);
      if (!isValidTotpSecret(secret)) {
        this.errorKey.set("authenticatorSecretInvalid");
        return;
      }
      this.errorKey.set(null);
    }
    if (saveNow) {
      await this.submit();
    }
  }

  private async defaultName(): Promise<string> {
    const issuer = this.form.controls.issuer.value.trim();
    if (issuer) {
      return issuer;
    }
    const state = await firstValueFrom(this.authenticator.state$);
    return this.i18n.t("authenticatorDefaultName", String(state.entries.length + 1));
  }
}

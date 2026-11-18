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
import { isValidTotpSecret, parseOtpAuthUri } from "../authenticator-otpauth";
import { barcodeDetectorAvailable, scanCurrentTabForOtpauth } from "../authenticator-scan";
import {
  AuthenticatorAlgorithm,
  AuthenticatorAlgorithms,
  DEFAULT_AUTHENTICATOR_DIGITS,
  DEFAULT_AUTHENTICATOR_PERIOD,
} from "../authenticator.models";

import { AuthenticatorDraft, AuthenticatorService, draftFromView } from "./authenticator.service";

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

  protected readonly algorithms = [
    AuthenticatorAlgorithms.Sha1,
    AuthenticatorAlgorithms.Sha256,
    AuthenticatorAlgorithms.Sha512,
  ];
  protected readonly canScan = barcodeDetectorAvailable();
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly scanning = signal(false);
  protected readonly errorKey = signal<string | null>(null);
  protected readonly titleKey = signal("authenticatorAdd");

  protected readonly form = this.formBuilder.nonNullable.group({
    name: ["", Validators.required],
    issuer: [""],
    secret: ["", Validators.required],
    algorithm: [AuthenticatorAlgorithms.Sha1 as AuthenticatorAlgorithm],
    digits: [
      DEFAULT_AUTHENTICATOR_DIGITS,
      [Validators.required, Validators.min(6), Validators.max(8)],
    ],
    period: [DEFAULT_AUTHENTICATOR_PERIOD, [Validators.required, Validators.min(1)]],
    notes: [""],
    favorite: [false],
  });

  private readonly entryId = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.paramMap.get("id");
    if (!id) {
      return;
    }
    this.entryId.set(id);
    this.titleKey.set("authenticatorEdit");
    this.loading.set(true);
    const state = await firstValueFrom(this.authenticator.state$);
    const entry = state.entries.find((item) => item.id === id);
    this.loading.set(false);
    if (!entry) {
      this.errorKey.set("authenticatorMissing");
      return;
    }
    this.form.patchValue(draftFromView(entry));
  }

  protected async submit(): Promise<void> {
    if (this.form.invalid) {
      return;
    }
    const draft = this.form.getRawValue() satisfies AuthenticatorDraft;
    if (!isValidTotpSecret(draft.secret)) {
      this.errorKey.set("authenticatorSecretInvalid");
      return;
    }
    this.saving.set(true);
    this.errorKey.set(null);
    try {
      await this.authenticator.save(draft, this.entryId() ?? undefined);
      await this.router.navigate(["/tabs/authenticator"]);
    } catch {
      this.errorKey.set("authenticatorSaveError");
    } finally {
      this.saving.set(false);
    }
  }

  protected async pasteUri(): Promise<void> {
    let text = "";
    try {
      text = await navigator.clipboard.readText();
    } catch {
      this.errorKey.set("authenticatorPasteFailed");
      return;
    }
    this.applyUri(text);
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
      this.applyUri(uri);
      this.toast.showToast({
        variant: "success",
        title: null,
        message: this.i18n.t("authenticatorScanFound"),
      });
    } finally {
      this.scanning.set(false);
    }
  }

  private applyUri(value: string): void {
    const parsed = parseOtpAuthUri(value);
    if (!parsed) {
      this.errorKey.set("authenticatorInvalidUri");
      return;
    }
    this.errorKey.set(null);
    this.form.patchValue(parsed);
  }
}

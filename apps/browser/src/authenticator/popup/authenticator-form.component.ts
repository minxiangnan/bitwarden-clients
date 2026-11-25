import { CommonModule } from "@angular/common";
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  inject,
  OnInit,
  signal,
} from "@angular/core";
import { FormBuilder, ReactiveFormsModule, Validators } from "@angular/forms";
import { ActivatedRoute, Router } from "@angular/router";
import { firstValueFrom } from "rxjs";

import { JslibModule } from "@bitwarden/angular/jslib.module";
import { I18nService } from "@bitwarden/common/platform/abstractions/i18n.service";
import {
  ButtonModule,
  CheckboxModule,
  destructiveDialogOptions,
  destructiveTitle,
  DialogService,
  FormFieldModule,
  ToastService,
} from "@bitwarden/components";

import { BrowserApi } from "../../platform/browser/browser-api";
import { PopOutComponent } from "../../platform/popup/components/pop-out.component";
import { PopupHeaderComponent } from "../../platform/popup/layout/popup-header.component";
import { PopupPageComponent } from "../../platform/popup/layout/popup-page.component";
import { parseAuthenticatorImport } from "../authenticator-import";
import { parseTagList, AuthenticatorKinds } from "../authenticator-meta";
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

import {
  AuthenticatorConflictError,
  AuthenticatorDraft,
  AuthenticatorService,
  draftFromView,
} from "./authenticator.service";
import { McpAccessService } from "./mcp-access.service";

@Component({
  selector: "app-authenticator-form",
  imports: [
    CommonModule,
    ReactiveFormsModule,
    JslibModule,
    ButtonModule,
    CheckboxModule,
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
  private readonly dialogService = inject(DialogService);
  private readonly changeDetector = inject(ChangeDetectorRef);
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
  protected readonly otpType = signal<"totp" | "steam" | "hotp">("totp");
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
    host: [""],
    tagsText: [""],
    counter: [0],
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
    const draft = draftFromView(entry);
    this.patchIfClean({
      name: draft.name,
      issuer: draft.issuer,
      secret: draft.secret,
      algorithm: draft.algorithm,
      digits: draft.digits,
      period: draft.period,
      notes: draft.notes,
      favorite: draft.favorite,
      host: draft.host ?? "",
      tagsText: (draft.tags ?? []).join(", "),
      counter: draft.counter ?? 0,
    });
    this.otpType.set(
      draft.kind === AuthenticatorKinds.Steam
        ? "steam"
        : draft.kind === AuthenticatorKinds.Hotp
          ? "hotp"
          : "totp",
    );
    const grant = await this.mcp.findAuthenticator(id);
    if (grant) {
      this.mcpWasEnabled.set(true);
      this.patchIfClean({ mcpEnabled: true, mcpAlias: grant.alias });
    }
    // The load is async. OnPush will not repaint the checkbox or alias unless asked.
    this.changeDetector.markForCheck();
  }

  /** A late load must not replace a field the user already started typing in. */
  private patchIfClean(values: Record<string, unknown>) {
    const next: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(values)) {
      const control = this.form.get(key);
      if (control && !control.dirty) {
        next[key] = value;
      }
    }
    this.form.patchValue(next);
  }

  protected setOtpType(value: string): void {
    const type = value === "steam" ? "steam" : value === "hotp" ? "hotp" : "totp";
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

  protected async useCurrentHost(): Promise<void> {
    const tab = await BrowserApi.getTabFromCurrentWindow();
    if (!tab?.url) {
      return;
    }
    try {
      this.form.controls.host.setValue(new URL(tab.url).hostname);
    } catch {
      this.form.controls.host.setValue("");
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
    const raw = this.form.getRawValue();
    const draft: AuthenticatorDraft = {
      name: raw.name,
      issuer: raw.issuer,
      secret: raw.secret,
      algorithm: raw.algorithm,
      digits: raw.digits,
      period: raw.period,
      notes: raw.notes,
      favorite: raw.favorite,
      kind:
        this.otpType() === "steam"
          ? AuthenticatorKinds.Steam
          : this.otpType() === "hotp"
            ? AuthenticatorKinds.Hotp
            : AuthenticatorKinds.Totp,
      host: raw.host,
      tags: parseTagList(raw.tagsText),
      counter: raw.counter,
    };
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
    if (mcpEnabled && this.otpType() === "hotp") {
      this.errorKey.set("mcpHotpUnsupported");
      return;
    }
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
      // The first save notifies other devices before the alias write. Touch the entry again
      // so they reload after the alias is stored. Vaultwarden 1.2.2 notifies on that update.
      if (entryId && (mcpEnabled || this.mcpWasEnabled())) {
        await this.authenticator.save(draft, entryId);
      }
      await this.router.navigate(["/tabs/authenticator"]);
    } catch (error) {
      if (error instanceof AuthenticatorConflictError) {
        this.toast.showToast({
          variant: "error",
          title: null,
          message: "这条验证码刚在别的设备上改过，已重新加载，没有覆盖。",
        });
        await this.router.navigate(["/tabs/authenticator"]);
        return;
      }
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

  protected async move(direction: -1 | 1): Promise<void> {
    const id = this.entryId();
    if (id == null || this.saving()) {
      return;
    }
    this.saving.set(true);
    try {
      await this.authenticator.move(id, direction);
    } catch {
      this.toast.showToast({
        variant: "error",
        title: null,
        message: this.i18n.t("serverSaveFailed"),
      });
    } finally {
      this.saving.set(false);
    }
  }

  protected async remove(): Promise<void> {
    const id = this.entryId();
    if (id == null || this.saving()) {
      return;
    }
    const name = this.form.controls.name.value;
    const issuer = this.form.controls.issuer.value?.trim();
    const title = issuer
      ? `${issuer} · ${destructiveTitle(name, this.i18n.t("authenticator"))}`
      : destructiveTitle(name, this.i18n.t("authenticator"));
    const confirmed = await this.dialogService.openSimpleDialog(
      destructiveDialogOptions({
        title,
        content: this.i18n.t("destructiveAuthenticatorTrashBody"),
        acceptText: this.i18n.t("delete"),
      }),
    );
    if (!confirmed) {
      return;
    }
    this.saving.set(true);
    try {
      const state = await firstValueFrom(this.authenticator.state$);
      const entry = state.entries.find((item) => item.id === id);
      if (entry) {
        await this.authenticator.moveToTrash(entry);
        if (this.mcpWasEnabled() || this.form.controls.mcpEnabled.value) {
          await this.mcp.disableAuthenticator(id);
        }
      }
      await this.router.navigate(["/tabs/authenticator"]);
    } catch {
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
    } catch {
      this.errorKey.set("authenticatorSaveError");
    } finally {
      this.scanning.set(false);
    }
  }

  private async acceptInput(value: string, saveNow: boolean): Promise<void> {
    const trimmed = value.trim();
    const bulk = parseAuthenticatorImport(trimmed);
    if (trimmed.toLowerCase().startsWith("otpauth-migration://") || bulk.entries.length > 1) {
      if (bulk.encrypted) {
        this.errorKey.set("authenticatorImportEncrypted");
        return;
      }
      if (bulk.entries.length === 0) {
        this.errorKey.set("authenticatorImportEmpty");
        return;
      }
      await this.authenticator.saveImported(bulk.entries);
      await this.router.navigate(["/tabs/authenticator"]);
      return;
    }
    if (trimmed.toLowerCase().startsWith("otpauth://")) {
      const parsed = parseOtpAuthUri(trimmed);
      if (!parsed) {
        this.errorKey.set("authenticatorInvalidUri");
        return;
      }
      this.errorKey.set(null);
      this.otpType.set(
        parsed.kind === AuthenticatorKinds.Steam
          ? "steam"
          : parsed.kind === AuthenticatorKinds.Hotp
            ? "hotp"
            : "totp",
      );
      this.form.patchValue({
        name: parsed.name,
        issuer: parsed.issuer,
        secret: parsed.secret,
        algorithm: parsed.algorithm,
        digits: parsed.digits,
        period: parsed.period,
        counter: parsed.counter,
      });
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

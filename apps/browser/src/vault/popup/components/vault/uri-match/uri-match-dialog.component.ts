import { ChangeDetectionStrategy, Component, inject } from "@angular/core";
import { FormBuilder, ReactiveFormsModule } from "@angular/forms";

import { JslibModule } from "@bitwarden/angular/jslib.module";
import { UriMatchStrategySetting } from "@bitwarden/common/models/domain/domain-service";
import {
  ButtonModule,
  DIALOG_DATA,
  DialogConfig,
  DialogModule,
  DialogRef,
  DialogService,
} from "@bitwarden/components";

import { URI_MATCH_CHOICES, UriMatchChoice } from "./uri-match";

export type UriMatchDialogParams = {
  uris: { uri: string; match: UriMatchChoice }[];
};

export type UriMatchDialogResult = {
  matches: UriMatchChoice[];
};

/** Small dialog that sets each login URI's match detection. */
@Component({
  selector: "app-uri-match-dialog",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonModule, DialogModule, JslibModule, ReactiveFormsModule],
  templateUrl: "./uri-match-dialog.component.html",
})
export class UriMatchDialogComponent {
  protected readonly choices = URI_MATCH_CHOICES;
  private readonly params = inject<UriMatchDialogParams>(DIALOG_DATA);
  private readonly dialogRef = inject<DialogRef<UriMatchDialogResult>>(DialogRef);
  private readonly formBuilder = inject(FormBuilder);
  protected readonly uris = this.params.uris;
  protected readonly form = this.formBuilder.array(
    this.params.uris.map((uri) =>
      this.formBuilder.nonNullable.control(uri.match == null ? "" : String(uri.match)),
    ),
  );

  protected save(): void {
    const matches = this.form.getRawValue().map((value) => toUriMatchChoice(value));
    void this.dialogRef.close({ matches });
  }

  static open(dialogService: DialogService, config: DialogConfig<UriMatchDialogParams>) {
    return dialogService.open<UriMatchDialogResult>(UriMatchDialogComponent, config);
  }
}

function toUriMatchChoice(value: string): UriMatchChoice {
  if (value === "") {
    return null;
  }
  return Number(value) as UriMatchStrategySetting;
}

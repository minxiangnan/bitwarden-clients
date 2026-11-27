import { ChangeDetectionStrategy, Component, computed, input } from "@angular/core";

import { JslibModule } from "@bitwarden/angular/jslib.module";
import { CipherViewLike } from "@bitwarden/common/vault/utils/cipher-view-like-utils";

import { customUriMatchLabelKey } from "./uri-match";

/** Small label beside a vault row subtitle when that login has its own match rule. */
@Component({
  selector: "app-uri-match-badge",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [JslibModule],
  template: `
    @if (labelKey(); as key) {
      <span
        class="tw-inline-flex tw-shrink-0 tw-items-center tw-rounded tw-border tw-border-solid tw-border-primary-600 tw-bg-background tw-px-1 tw-text-[10px] tw-font-medium tw-leading-4 tw-text-primary-600"
        data-testid="uri-match-badge"
        >{{ key | i18n }}</span
      >
    }
  `,
})
export class UriMatchBadgeComponent {
  readonly cipher = input.required<CipherViewLike>();
  protected readonly labelKey = computed(() => customUriMatchLabelKey(this.cipher()));
}

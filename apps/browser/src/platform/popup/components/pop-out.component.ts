import { CommonModule } from "@angular/common";
import { Component, Input, OnInit, computed } from "@angular/core";

import { JslibModule } from "@bitwarden/angular/jslib.module";
import { PlatformUtilsService } from "@bitwarden/common/platform/abstractions/platform-utils.service";
import { ButtonType, IconButtonModule } from "@bitwarden/components";

import BrowserPopupUtils from "../../browser/browser-popup-utils";

// FIXME(https://bitwarden.atlassian.net/browse/CL-764): Migrate to OnPush
// eslint-disable-next-line @angular-eslint/prefer-on-push-component-change-detection
@Component({
  selector: "app-pop-out",
  templateUrl: "pop-out.component.html",
  imports: [CommonModule, JslibModule, IconButtonModule],
})
export class PopOutComponent implements OnInit {
  // FIXME(https://bitwarden.atlassian.net/browse/CL-903): Migrate to Signals
  // eslint-disable-next-line @angular-eslint/prefer-signals
  @Input() show = true;

  /** The header is cream in both themes, so the ghost icon stays visible. */
  protected readonly buttonType = computed<ButtonType>(() => "primaryGhost");

  constructor(private platformUtilsService: PlatformUtilsService) {}

  async ngOnInit() {
    if (this.show) {
      if (
        (BrowserPopupUtils.inSidebar(window) && this.platformUtilsService.isFirefox()) ||
        BrowserPopupUtils.inPopout(window)
      ) {
        this.show = false;
      }
    }
  }

  async expand() {
    await BrowserPopupUtils.openCurrentPagePopout(window);
  }
}

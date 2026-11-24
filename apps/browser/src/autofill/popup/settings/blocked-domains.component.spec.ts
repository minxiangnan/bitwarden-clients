import { TestBed } from "@angular/core/testing";
import { FormBuilder } from "@angular/forms";
import { of } from "rxjs";

import { DomainSettingsService } from "@bitwarden/common/autofill/services/domain-settings.service";
import { I18nService } from "@bitwarden/common/platform/abstractions/i18n.service";
import { DialogService, ToastService } from "@bitwarden/components";

import { PopupRouterCacheService } from "../../../platform/popup/view-cache/popup-router-cache.service";

import { BlockedDomainsComponent } from "./blocked-domains.component";

describe("BlockedDomainsComponent", () => {
  it("asks before removing a never-save website and keeps it when cancelled", async () => {
    const openSimpleDialog = jest.fn().mockResolvedValue(false);
    TestBed.overrideComponent(BlockedDomainsComponent, { set: { imports: [], template: "" } });
    TestBed.configureTestingModule({
      imports: [BlockedDomainsComponent],
      providers: [
        FormBuilder,
        {
          provide: DomainSettingsService,
          useValue: { blockedInteractionsUris$: of({}) },
        },
        { provide: I18nService, useValue: { t: (key: string) => key } },
        { provide: ToastService, useValue: { showToast: jest.fn() } },
        { provide: DialogService, useValue: { openSimpleDialog } },
        { provide: PopupRouterCacheService, useValue: { back: jest.fn() } },
      ],
    });

    const component = TestBed.createComponent(BlockedDomainsComponent).componentInstance;
    component.blockedDomainsState = ["example.com"];

    await component.removeDomain(0);

    expect(openSimpleDialog).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "example.com",
        content: "destructiveDomainBody",
        type: "danger",
        focusCancel: true,
      }),
    );
    expect(component.blockedDomainsState).toEqual(["example.com"]);
  });
});

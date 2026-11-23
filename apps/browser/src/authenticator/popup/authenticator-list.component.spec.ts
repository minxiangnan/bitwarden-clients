import { TestBed } from "@angular/core/testing";
import { Router } from "@angular/router";
import { BehaviorSubject } from "rxjs";

import { I18nService } from "@bitwarden/common/platform/abstractions/i18n.service";
import { PlatformUtilsService } from "@bitwarden/common/platform/abstractions/platform-utils.service";
import { ToastService } from "@bitwarden/components";

import { AuthenticatorEntryView } from "../authenticator.models";

import { AuthenticatorListComponent } from "./authenticator-list.component";
import { AuthenticatorService } from "./authenticator.service";

describe("AuthenticatorListComponent", () => {
  const entry = {
    id: "1",
    name: "Ada",
    issuer: "",
    secret: "WQIQ25BRKZYCJVYP",
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    notes: "",
    favorite: false,
    sortOrder: 1,
    revisionDate: "",
    creationDate: "",
    undecryptable: false,
  } satisfies AuthenticatorEntryView;

  function setup() {
    const state$ = new BehaviorSubject({ status: "ready" as const, entries: [entry] });
    const authenticator = {
      state$,
      setFavorite: jest.fn(() => new Promise<void>(() => undefined)),
      remove: jest.fn(() => new Promise<void>(() => undefined)),
      move: jest.fn().mockResolvedValue(undefined),
    };
    TestBed.overrideComponent(AuthenticatorListComponent, {
      set: { imports: [], template: "" },
    });
    TestBed.configureTestingModule({
      imports: [AuthenticatorListComponent],
      providers: [
        { provide: AuthenticatorService, useValue: authenticator },
        { provide: Router, useValue: { navigate: jest.fn() } },
        { provide: PlatformUtilsService, useValue: { copyToClipboard: jest.fn() } },
        { provide: ToastService, useValue: { showToast: jest.fn() } },
        { provide: I18nService, useValue: { t: (key: string) => key } },
      ],
    });
    const fixture = TestBed.createComponent(AuthenticatorListComponent);
    return { fixture, authenticator };
  }

  it("ignores a second favorite click while the first is still saving", () => {
    const { fixture, authenticator } = setup();

    void fixture.componentInstance["toggleFavorite"](entry);
    void fixture.componentInstance["toggleFavorite"](entry);

    expect(authenticator.setFavorite).toHaveBeenCalledTimes(1);
  });

  it("opens the tools page for import and trash", () => {
    const { fixture } = setup();
    const router = TestBed.inject(Router);

    fixture.componentInstance["openTools"]();

    expect(router.navigate).toHaveBeenCalledWith(["/authenticator-tools"]);
  });

  it("does not edit an entry that could not be decrypted", () => {
    const { fixture } = setup();
    const router = TestBed.inject(Router);

    fixture.componentInstance["edit"]({ ...entry, undecryptable: true });

    expect(router.navigate).not.toHaveBeenCalled();
  });
});

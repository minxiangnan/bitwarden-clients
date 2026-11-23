import { TestBed } from "@angular/core/testing";
import { ActivatedRoute, Router } from "@angular/router";
import { of } from "rxjs";

import { I18nService } from "@bitwarden/common/platform/abstractions/i18n.service";
import { ToastService } from "@bitwarden/components";

import { AuthenticatorFormComponent } from "./authenticator-form.component";
import { AuthenticatorService } from "./authenticator.service";

describe("AuthenticatorFormComponent", () => {
  function setup(entries: unknown[] = []) {
    TestBed.overrideComponent(AuthenticatorFormComponent, {
      set: { imports: [], template: "" },
    });
    TestBed.configureTestingModule({
      imports: [AuthenticatorFormComponent],
      providers: [
        {
          provide: AuthenticatorService,
          useValue: {
            state$: of({ status: "ready", entries }),
            save: jest.fn(async (): Promise<void> => undefined),
          },
        },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: { get: (): string | null => null } } },
        },
        { provide: Router, useValue: { navigate: jest.fn() } },
        { provide: I18nService, useValue: { t: (key: string) => key } },
        { provide: ToastService, useValue: { showToast: jest.fn() } },
      ],
    });
    const fixture = TestBed.createComponent(AuthenticatorFormComponent);
    return fixture.componentInstance;
  }

  it("accepts digits 5 through 10 and periods up to one day", () => {
    const component = setup();

    component["form"].controls.digits.setValue(4);
    expect(component["form"].controls.digits.valid).toBe(false);
    component["form"].controls.digits.setValue(5);
    expect(component["form"].controls.digits.valid).toBe(true);
    component["form"].controls.digits.setValue(10);
    expect(component["form"].controls.digits.valid).toBe(true);
    component["form"].controls.digits.setValue(11);
    expect(component["form"].controls.digits.valid).toBe(false);
    component["form"].controls.period.setValue(86400);
    expect(component["form"].controls.period.valid).toBe(true);
    component["form"].controls.period.setValue(86401);
    expect(component["form"].controls.period.valid).toBe(false);
  });

  it("disables editing when the entry could not be decrypted", async () => {
    TestBed.resetTestingModule();
    TestBed.overrideComponent(AuthenticatorFormComponent, {
      set: { imports: [], template: "" },
    });
    TestBed.configureTestingModule({
      imports: [AuthenticatorFormComponent],
      providers: [
        {
          provide: AuthenticatorService,
          useValue: {
            state$: of({
              status: "ready",
              entries: [
                {
                  id: "1",
                  name: "",
                  issuer: "",
                  secret: "",
                  algorithm: "SHA1",
                  digits: 6,
                  period: 30,
                  notes: "",
                  favorite: false,
                  sortOrder: 0,
                  revisionDate: "",
                  creationDate: "",
                  undecryptable: true,
                },
              ],
            }),
            save: jest.fn(async (): Promise<void> => undefined),
          },
        },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: { get: (): string | null => "1" } } },
        },
        { provide: Router, useValue: { navigate: jest.fn() } },
        { provide: I18nService, useValue: { t: (key: string) => key } },
        { provide: ToastService, useValue: { showToast: jest.fn() } },
      ],
    });
    const fixture = TestBed.createComponent(AuthenticatorFormComponent);
    await fixture.componentInstance.ngOnInit();

    expect(fixture.componentInstance["form"].disabled).toBe(true);
    expect(fixture.componentInstance["errorKey"]()).toBe("authenticatorUndecryptable");
  });
});

import { TestBed } from "@angular/core/testing";
import { ActivatedRoute, Router } from "@angular/router";
import { of } from "rxjs";

import { I18nService } from "@bitwarden/common/platform/abstractions/i18n.service";
import { ToastService } from "@bitwarden/components";

import { AuthenticatorFormComponent } from "./authenticator-form.component";
import { AuthenticatorService } from "./authenticator.service";
import { McpAccessService } from "./mcp-access.service";

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
        {
          provide: I18nService,
          useValue: { t: (key: string, value?: string) => value ?? key },
        },
        { provide: ToastService, useValue: { showToast: jest.fn() } },
        {
          provide: McpAccessService,
          useValue: {
            findAuthenticator: jest.fn(async () => null),
            hasToken: jest.fn(async () => false),
            upsertAuthenticator: jest.fn(async () => undefined),
            disableAuthenticator: jest.fn(async () => undefined),
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(AuthenticatorFormComponent);
    return fixture.componentInstance;
  }

  it("does not require a name", () => {
    const component = setup();

    component["form"].controls.name.setValue("");
    component["form"].controls.secret.setValue("WQIQ25BRKZYCJVYP");

    expect(component["form"].controls.name.valid).toBe(true);
    expect(component["form"].valid).toBe(true);
  });

  it("saves a pasted otpauth link immediately", async () => {
    const component = setup();
    const authenticator = TestBed.inject(AuthenticatorService);

    await component["acceptInput"](
      "otpauth://totp/GitHub:ada?secret=wqiq%2025br%20kzyc%20jvyp&issuer=GitHub",
      true,
    );

    expect(authenticator.save).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "ada",
        issuer: "GitHub",
        secret: "WQIQ25BRKZYCJVYP",
        algorithm: "SHA1",
        digits: 6,
        period: 30,
      }),
      undefined,
    );
    expect(TestBed.inject(Router).navigate).toHaveBeenCalledWith(["/tabs/authenticator"]);
  });

  it("saves a raw Base32 secret and names it from the account count", async () => {
    const component = setup([{ id: "existing" }]);

    await component["acceptInput"]("wqiq 25br kzyc jvyp", true);

    expect(TestBed.inject(AuthenticatorService).save).toHaveBeenCalledWith(
      expect.objectContaining({ name: "2", secret: "WQIQ25BRKZYCJVYP" }),
      undefined,
    );
  });

  it("parses an otpauth link left in the secret field when saving", async () => {
    const component = setup();
    component["form"].controls.secret.setValue(
      "otpauth://totp/GitHub:ada?secret=WQIQ25BRKZYCJVYP&issuer=GitHub",
    );

    await component["submit"]();

    expect(TestBed.inject(AuthenticatorService).save).toHaveBeenCalledWith(
      expect.objectContaining({ name: "ada", issuer: "GitHub", secret: "WQIQ25BRKZYCJVYP" }),
      undefined,
    );
  });

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
        {
          provide: I18nService,
          useValue: { t: (key: string, value?: string) => value ?? key },
        },
        { provide: ToastService, useValue: { showToast: jest.fn() } },
        {
          provide: McpAccessService,
          useValue: {
            findAuthenticator: jest.fn(async () => null),
            hasToken: jest.fn(async () => false),
            upsertAuthenticator: jest.fn(async () => undefined),
            disableAuthenticator: jest.fn(async () => undefined),
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(AuthenticatorFormComponent);
    await fixture.componentInstance.ngOnInit();

    expect(fixture.componentInstance["form"].disabled).toBe(true);
    expect(fixture.componentInstance["errorKey"]()).toBe("authenticatorUndecryptable");
  });
});

import { TestBed } from "@angular/core/testing";
import { of } from "rxjs";

import { TotpService } from "@bitwarden/common/vault/abstractions/totp.service";

import { AuthenticatorEntryView } from "../authenticator.models";

import { AuthenticatorCodeComponent, codeFace } from "./authenticator-code.component";

describe("AuthenticatorCodeComponent", () => {
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
    sortOrder: 0,
    revisionDate: "",
    creationDate: "",
    undecryptable: false,
  } satisfies AuthenticatorEntryView;

  it("uses the floored TOTP step for the countdown", async () => {
    const totpService = {
      getCode$: () => of({ code: "123456", period: 30 }),
    };
    TestBed.configureTestingModule({
      imports: [AuthenticatorCodeComponent],
      providers: [{ provide: TotpService, useValue: totpService }],
    });
    jest.spyOn(Date, "now").mockReturnValue(30_000_600);

    const fixture = TestBed.createComponent(AuthenticatorCodeComponent);
    fixture.componentRef.setInput("entry", entry);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain("123 456");
    expect(fixture.nativeElement.textContent).toContain("30");
    const countdown = fixture.nativeElement.querySelector("[data-zh-countdown]");
    expect(countdown).not.toBeNull();
    expect(countdown.querySelector("[data-zh-countdown-track]").parentElement).toBe(countdown);
    expect(countdown.querySelector("[data-zh-countdown-seconds]").parentElement).toBe(countdown);
    expect(fixture.nativeElement.querySelector("[data-zh-ring]")).toBeNull();
    expect(
      fixture.nativeElement.querySelector("[data-zh-countdown]").hasAttribute("data-zh-urgent"),
    ).toBe(false);
    expect(fixture.nativeElement.textContent).not.toContain("下一段");
    jest.restoreAllMocks();
  });

  it("shows the next code only in the last five seconds", async () => {
    const totpService = {
      getCode$: () => of({ code: "123456", period: 30 }),
    };
    TestBed.configureTestingModule({
      imports: [AuthenticatorCodeComponent],
      providers: [{ provide: TotpService, useValue: totpService }],
    });
    jest.spyOn(Date, "now").mockReturnValue(25_000);

    const fixture = TestBed.createComponent(AuthenticatorCodeComponent);
    fixture.componentRef.setInput("entry", entry);
    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve, 50));
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain("下一段");
    expect(
      fixture.nativeElement.querySelector("[data-zh-countdown]").hasAttribute("data-zh-urgent"),
    ).toBe(true);
    jest.restoreAllMocks();
  });

  it("fills the bar with the time left and flags a new period", () => {
    jest.spyOn(Date, "now").mockReturnValue(30_000_600);
    expect(codeFace("123456", 30, "").remaining).toBe(1);
    expect(codeFace("123456", 30, "").low).toBe(false);

    jest.spyOn(Date, "now").mockReturnValue(25_000);
    const late = codeFace("123456", 30, "");
    expect(late.seconds).toBe(5);
    expect(late.low).toBe(true);
    expect(late.remaining).toBeCloseTo(5 / 30);

    expect(codeFace("123456", 0, "").seconds).toBe(0);
    jest.restoreAllMocks();
  });
});

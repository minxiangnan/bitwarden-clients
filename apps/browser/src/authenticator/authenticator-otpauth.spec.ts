import {
  filterAuthenticatorEntries,
  isValidTotpSecret,
  parseOtpAuthUri,
  toOtpAuthUri,
} from "./authenticator-otpauth";
import { AuthenticatorEntryView } from "./authenticator.models";

describe("authenticator otpauth", () => {
  const entry = {
    id: "1",
    name: "Ada",
    issuer: "Example",
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

  it("builds and parses an otpauth URI", () => {
    const parsed = parseOtpAuthUri(toOtpAuthUri(entry));

    expect(parsed).toEqual({
      name: "Ada",
      issuer: "Example",
      secret: "WQIQ25BRKZYCJVYP",
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      kind: "totp",
      counter: 0,
    });
  });

  it("rejects a URI that is not a TOTP secret", () => {
    expect(parseOtpAuthUri("https://example.com")).toBeNull();
    expect(parseOtpAuthUri("otpauth://hotp/Name?secret=WQIQ25BRKZYCJVYP&counter=4")).toEqual(
      expect.objectContaining({ kind: "hotp", counter: 4, name: "Name" }),
    );
    expect(parseOtpAuthUri("otpauth://totp/%E0%A4%A?secret=WQIQ25BRKZYCJVYP")).toBeNull();
    expect(parseOtpAuthUri("otpauth://totp/Name?secret=WQIQ25BRKZYCJVYP&digits=4")).toBeNull();
    expect(parseOtpAuthUri("otpauth://totp/Name?secret=WQIQ25BRKZYCJVYP&period=90000")).toBeNull();
  });

  it("accepts 5 to 10 digits, a one-day period, and Steam as 5 digits", () => {
    expect(
      parseOtpAuthUri("otpauth://totp/Name?secret=WQIQ25BRKZYCJVYP&digits=5&period=1")?.digits,
    ).toBe(5);
    expect(
      parseOtpAuthUri("otpauth://totp/Name?secret=WQIQ25BRKZYCJVYP&digits=10&period=86400")?.period,
    ).toBe(86400);
    const steam = parseOtpAuthUri("otpauth://totp/Steam?secret=WQIQ25BRKZYCJVYP&algorithm=steam");
    expect(steam).toEqual(expect.objectContaining({ algorithm: "SHA1", digits: 5 }));
  });

  it("accepts a spaced Base32 secret and rejects a short one", () => {
    expect(isValidTotpSecret("wqiq 25br kzyc jvyp")).toBe(true);
    expect(isValidTotpSecret("short")).toBe(false);
  });

  it("filters by search and favorites, ordered by sortOrder", () => {
    const other = { ...entry, id: "2", name: "Work", issuer: "Mail", favorite: true, sortOrder: 2 };
    const notes = { ...entry, id: "3", name: "Bank", notes: "backup" };

    expect(
      filterAuthenticatorEntries([entry, other], "mail", false).map((item) => item.id),
    ).toEqual(["2"]);
    expect(
      filterAuthenticatorEntries([entry, other, notes], "", true).map((item) => item.id),
    ).toEqual(["2"]);
    expect(filterAuthenticatorEntries([entry, other], "", false).map((item) => item.id)).toEqual([
      "1",
      "2",
    ]);
    expect(filterAuthenticatorEntries([notes], "backup", false)).toHaveLength(1);
    expect(filterAuthenticatorEntries([notes], "BACKUP", false)).toHaveLength(1);

    const chinese = { ...entry, id: "4", name: "邮箱", notes: "备用机" };
    expect(filterAuthenticatorEntries([chinese], "邮箱", false)).toHaveLength(1);
    expect(filterAuthenticatorEntries([chinese], "备用", false)).toHaveLength(1);
    expect(filterAuthenticatorEntries([chinese], "不存在", false)).toHaveLength(0);
  });
});

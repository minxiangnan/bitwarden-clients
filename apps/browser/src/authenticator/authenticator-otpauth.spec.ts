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
    });
  });

  it("rejects a URI that is not a TOTP secret", () => {
    expect(parseOtpAuthUri("https://example.com")).toBeNull();
    expect(parseOtpAuthUri("otpauth://hotp/Name?secret=WQIQ25BRKZYCJVYP")).toBeNull();
  });

  it("accepts a spaced Base32 secret and rejects a short one", () => {
    expect(isValidTotpSecret("wqiq 25br kzyc jvyp")).toBe(true);
    expect(isValidTotpSecret("short")).toBe(false);
  });

  it("filters by search and favorites, with favorites first", () => {
    const other = { ...entry, id: "2", name: "Work", issuer: "Mail", favorite: true, sortOrder: 2 };
    const notes = { ...entry, id: "3", name: "Bank", notes: "backup" };

    expect(
      filterAuthenticatorEntries([entry, other], "mail", false).map((item) => item.id),
    ).toEqual(["2"]);
    expect(
      filterAuthenticatorEntries([entry, other, notes], "", true).map((item) => item.id),
    ).toEqual(["2"]);
    expect(filterAuthenticatorEntries([entry, other], "", false).map((item) => item.id)).toEqual([
      "2",
      "1",
    ]);
    expect(filterAuthenticatorEntries([notes], "backup", false)).toHaveLength(1);
  });
});

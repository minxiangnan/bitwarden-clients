import { hotpFromKey, steamCode, totpCode } from "./authenticator-codes";
import { buildAuthenticatorExport } from "./authenticator-export";
import { decodeMigrationPayload, parseAuthenticatorImport } from "./authenticator-import";
import { bestAuthenticatorForUrl, entryMatchesHost } from "./authenticator-match";
import {
  joinAuthenticatorNotes,
  kindFromStored,
  splitAuthenticatorNotes,
} from "./authenticator-meta";
import { rememberRecentId } from "./authenticator-ui-state";
import { AuthenticatorEntryView } from "./authenticator.models";
import { clipboardClearMs } from "./clipboard-delay";
import {
  classifyPasswords,
  exposedCountFromRange,
  isWeakPassword,
  lookupExposedCounts,
} from "./password-health";
import { PasswordPresets } from "./password-presets";

const RFC_KEY = new TextEncoder().encode("12345678901234567890");

function entry(partial: Partial<AuthenticatorEntryView>): AuthenticatorEntryView {
  return {
    id: "1",
    name: "Ada",
    issuer: "GitHub",
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
    kind: "totp",
    host: "",
    tags: [],
    counter: 0,
    ...partial,
  };
}

describe("authenticator codes", () => {
  it("matches the RFC 4226 HOTP vector and the RFC 6238 TOTP vectors", async () => {
    await expect(hotpFromKey(RFC_KEY, 0, 6, "SHA1")).resolves.toBe("755224");
    await expect(hotpFromKey(RFC_KEY, 1, 8, "SHA1")).resolves.toBe("94287082");
    await expect(
      hotpFromKey(new TextEncoder().encode("12345678901234567890123456789012"), 1, 8, "SHA256"),
    ).resolves.toBe("46119246");
    await expect(
      hotpFromKey(
        new TextEncoder().encode(
          "1234567890123456789012345678901234567890123456789012345678901234",
        ),
        1,
        8,
        "SHA512",
      ),
    ).resolves.toBe("90693936");
    await expect(totpCode("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", 59_000, 30, 8, "SHA1")).resolves.toBe(
      "94287082",
    );
  });

  it("builds a 5-character Steam code from the Steam alphabet", async () => {
    const code = await steamCode("WQIQ25BRKZYCJVYP", 1_700_000_000_000);
    expect(code).toMatch(/^[23456789BCDFGHJKMNPQRTVWXY]{5}$/);
  });
});

describe("authenticator notes metadata", () => {
  it("round-trips host, tags, and kind inside the encrypted notes", () => {
    const notes = joinAuthenticatorNotes(
      "desk",
      { kind: "hotp", host: "GitHub.com", tags: ["工作", "工作"], counter: 3 },
      6,
    );
    const split = splitAuthenticatorNotes(notes);

    expect(split.text).toBe("desk");
    expect(split.hasTrailer).toBe(true);
    expect(split.meta).toEqual({
      kind: "hotp",
      host: "github.com",
      tags: ["工作"],
      counter: 3,
      deletedAt: null,
    });
  });

  it("keeps a 5-digit TOTP distinct from an older Steam entry", () => {
    const plain = joinAuthenticatorNotes(
      "x",
      { kind: "totp", host: "", tags: [], counter: 0, deletedAt: null },
      6,
    );
    expect(plain).toBe("x");
    expect(
      kindFromStored({ kind: "totp", host: "", tags: [], counter: 0, deletedAt: null }, false, 5),
    ).toBe("steam");

    const totpFive = joinAuthenticatorNotes(
      "x",
      { kind: "totp", host: "", tags: [], counter: 0, deletedAt: null },
      5,
    );
    const split = splitAuthenticatorNotes(totpFive);
    expect(kindFromStored(split.meta, split.hasTrailer, 5)).toBe("totp");
  });
});

describe("authenticator import and export", () => {
  it("reads otpauth lines, Aegis, 2FAS, Bitwarden JSON, and CSV", () => {
    expect(
      parseAuthenticatorImport("otpauth://totp/GitHub:ada?secret=WQIQ25BRKZYCJVYP").entries,
    ).toEqual([expect.objectContaining({ issuer: "GitHub", secret: "WQIQ25BRKZYCJVYP" })]);
    expect(
      parseAuthenticatorImport(
        JSON.stringify({
          db: {
            entries: [
              {
                type: "totp",
                name: "ada",
                issuer: "GitHub",
                info: { secret: "WQIQ25BRKZYCJVYP", algo: "SHA1", digits: 6, period: 30 },
              },
            ],
          },
        }),
      ).format,
    ).toBe("aegis");
    expect(
      parseAuthenticatorImport(JSON.stringify({ header: { slots: [{ type: 1 }] } })).encrypted,
    ).toBe(true);
    expect(
      parseAuthenticatorImport(
        JSON.stringify({
          services: [
            {
              name: "GitHub",
              secret: "WQIQ25BRKZYCJVYP",
              otp: { account: "ada", issuer: "GitHub", tokenType: "TOTP" },
            },
          ],
        }),
      ).entries[0],
    ).toEqual(expect.objectContaining({ name: "ada", issuer: "GitHub" }));
    expect(
      parseAuthenticatorImport(
        JSON.stringify({
          items: [
            { name: "Mail", login: { totp: "otpauth://totp/Mail:ada?secret=WQIQ25BRKZYCJVYP" } },
          ],
        }),
      ).entries[0].name,
    ).toBe("ada");
    expect(
      parseAuthenticatorImport("name,login_totp\nMail,WQIQ25BRKZYCJVYP\n").entries[0].secret,
    ).toBe("WQIQ25BRKZYCJVYP");
  });

  it("decodes a Google Authenticator migration payload", () => {
    const secret = new TextEncoder().encode("12345678901234567890");
    const name = new TextEncoder().encode("Ada");
    const issuer = new TextEncoder().encode("GitHub");
    const otp = Uint8Array.from([
      ...fieldBytes(1, secret),
      ...fieldBytes(2, name),
      ...fieldBytes(3, issuer),
      ...fieldVarint(4, 1),
      ...fieldVarint(5, 1),
      ...fieldVarint(6, 2),
    ]);
    const payload = Uint8Array.from(fieldBytes(1, otp));
    const [imported] = decodeMigrationPayload(payload);

    expect(imported.secret).toBe("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
    expect(imported.issuer).toBe("GitHub");
    expect(imported.name).toBe("Ada");
  });

  it("exports a plaintext migration file and can import it back", () => {
    const document = buildAuthenticatorExport([
      entry({ host: "github.com", tags: ["工作"], notes: "desk" }),
    ]);
    expect(document.encrypted).toBe(false);
    expect(document.warning).toContain("明文");

    const imported = parseAuthenticatorImport(JSON.stringify(document));
    expect(imported.format).toBe("zh-authenticator");
    expect(imported.entries[0]).toEqual(
      expect.objectContaining({ host: "github.com", tags: ["工作"], notes: "desk" }),
    );
  });
});

describe("matching a code to the current site", () => {
  it("uses an exact host when one is stored, and a simple issuer otherwise", () => {
    const linked = entry({ host: "github.com", issuer: "GitHub" });
    expect(entryMatchesHost(linked, "github.com")).toBe(true);
    expect(entryMatchesHost(linked, "gist.github.com")).toBe(false);

    const inferred = entry({ host: "", issuer: "GitHub" });
    expect(bestAuthenticatorForUrl([inferred], "https://github.com/login")?.id).toBe("1");
    expect(
      bestAuthenticatorForUrl([inferred], "https://github.com.evil.test/")?.id,
    ).toBeUndefined();
  });

  it("does not guess when two codes match the same host", () => {
    const first = entry({ id: "1", host: "github.com" });
    const second = entry({ id: "2", name: "Bea", host: "github.com" });
    expect(bestAuthenticatorForUrl([first, second], "https://github.com")).toBeNull();
    expect(
      bestAuthenticatorForUrl([{ ...first, favorite: true }, second], "https://github.com")?.id,
    ).toBe("1");
  });
});

describe("password health and presets", () => {
  it("flags short, common, and reused passwords without sending them anywhere", () => {
    expect(isWeakPassword("password")).toBe(true);
    expect(isWeakPassword("correct-horse-battery")).toBe(false);
    const rows = classifyPasswords([
      { id: "a", name: "A", username: "ada", password: "password" },
      { id: "b", name: "B", username: "bea", password: "password" },
      { id: "c", name: "C", username: "cy", password: "correct-horse-battery" },
    ]);
    expect(rows.find((row) => row.id === "a")).toEqual(
      expect.objectContaining({ weak: true, reused: true }),
    );
    expect(rows.find((row) => row.id === "c")?.weak).toBe(false);
  });

  it("reads a k-anonymity range and only requests the hash prefix", async () => {
    expect(
      exposedCountFromRange(
        "0018A45C4D1DEF81644B54AB7F969B88D65:1\n",
        "0018A45C4D1DEF81644B54AB7F969B88D65",
      ),
    ).toBe(1);
    const seen: string[] = [];
    const counts = await lookupExposedCounts(["password"], async (prefix) => {
      seen.push(prefix);
      const hash = "5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8";
      return `${hash.slice(5)}:42`;
    });
    expect(seen).toEqual(["5BAA6"]);
    expect(counts.get("password")).toBe(42);
  });

  it("offers three generator presets", () => {
    expect(PasswordPresets.map((preset) => preset.id)).toEqual(["strong", "pin", "passphrase"]);
  });
});

describe("clipboard clearing", () => {
  it("maps the existing setting onto milliseconds", () => {
    expect(clipboardClearMs("never")).toBeUndefined();
    expect(clipboardClearMs("tenSeconds")).toBe(10_000);
    expect(clipboardClearMs("fiveMinutes")).toBe(300_000);
  });
});

describe("recent codes", () => {
  it("keeps the latest id first and drops duplicates", () => {
    expect(rememberRecentId(["a", "b"], "b", 3)).toEqual(["b", "a"]);
  });
});

function encodeVarint(value: number): number[] {
  const bytes: number[] = [];
  let rest = value;
  while (rest > 127) {
    bytes.push((rest & 0x7f) | 0x80);
    rest = Math.floor(rest / 128);
  }
  bytes.push(rest);
  return bytes;
}

function fieldBytes(field: number, data: Uint8Array): number[] {
  return [...encodeVarint((field << 3) | 2), ...encodeVarint(data.length), ...data];
}

function fieldVarint(field: number, value: number): number[] {
  return [...encodeVarint(field << 3), ...encodeVarint(value)];
}

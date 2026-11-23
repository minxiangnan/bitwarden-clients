import { readFileSync } from "fs";
import { join } from "path";

function keys(relativePath: string): string[] {
  const parsed = JSON.parse(readFileSync(join(__dirname, relativePath), "utf8")) as Record<
    string,
    unknown
  >;
  return Object.keys(parsed);
}

describe("zh_CN catalogs", () => {
  it("includes every browser English message key", () => {
    const english = new Set(keys("../../_locales/en/messages.json"));
    const chinese = new Set(keys("../../_locales/zh_CN/messages.json"));
    expect([...english].filter((key) => !chinese.has(key))).toEqual([]);
  });
});

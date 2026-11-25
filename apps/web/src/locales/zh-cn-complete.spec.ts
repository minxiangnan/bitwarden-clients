import { readFileSync } from "fs";
import { join } from "path";

describe("web zh_CN catalog", () => {
  it("includes every English message key", () => {
    const english = JSON.parse(
      readFileSync(join(__dirname, "en/messages.json"), "utf8"),
    ) as Record<string, unknown>;
    const chinese = JSON.parse(
      readFileSync(join(__dirname, "zh_CN/messages.json"), "utf8"),
    ) as Record<string, unknown>;
    expect(Object.keys(english).filter((key) => chinese[key] == null)).toEqual([]);
  });
});

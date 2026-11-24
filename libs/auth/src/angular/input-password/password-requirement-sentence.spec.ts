import { passwordRequirementSentence } from "./input-password.component";

describe("passwordRequirementSentence", () => {
  it("uses a Chinese full stop for zh locales", () => {
    expect(passwordRequirementSentence("至少 12 个字符", "zh-CN")).toBe("至少 12 个字符。");
    expect(passwordRequirementSentence("至少 12 个字符", "zh_TW")).toBe("至少 12 个字符。");
  });

  it("keeps an ASCII period for other locales", () => {
    expect(passwordRequirementSentence("At least 12 characters", "en")).toBe(
      "At least 12 characters.",
    );
  });
});

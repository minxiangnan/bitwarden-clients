import { destructiveDialogOptions, destructiveTitle } from "@bitwarden/components";

describe("destructiveDialogOptions", () => {
  it("names the item, uses the danger button, and focuses 取消", () => {
    expect(
      destructiveDialogOptions({
        title: destructiveTitle("  GitLab  ", "验证器"),
        content: "验证码会先放进回收站。",
        acceptText: "删除",
      }),
    ).toEqual({
      title: "GitLab",
      content: "验证码会先放进回收站。",
      type: "danger",
      acceptButtonText: "删除",
      cancelButtonText: { key: "cancel" },
      focusCancel: true,
    });
  });

  it("falls back when the item has no name", () => {
    expect(destructiveTitle("   ", "此项目")).toBe("此项目");
  });
});

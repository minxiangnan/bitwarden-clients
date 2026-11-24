import { confirmNeverSave, neverSaveHost } from "./never-save-confirm";

describe("confirmNeverSave", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("names the site, focuses 取消, and does not save when cancelled", async () => {
    const pending = confirmNeverSave({
      title: "example.com",
      body: "以后这个网站不再询问保存。",
      acceptLabel: "不再保存",
      cancelLabel: "取消",
    });

    const dialog = document.querySelector("[role='dialog']");
    const cancel = [...document.querySelectorAll("button")].find(
      (button) => button.textContent === "取消",
    );
    const markup = dialog?.innerHTML ?? "";

    expect(dialog?.getAttribute("aria-label")).toBe("example.com");
    expect(document.activeElement).toBe(cancel);
    expect(markup).not.toContain("#000");
    expect(markup).not.toContain("rgb(0, 0, 0)");
    expect(markup).toContain("rgb(196, 83, 42)");
    expect(markup).toContain("rgb(250, 249, 245)");

    cancel?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await expect(pending).resolves.toBe(false);
    expect(document.querySelector("[role='dialog']")).toBeNull();
  });

  it("resolves when the terracotta action is chosen", async () => {
    const pending = confirmNeverSave({
      title: "example.com",
      body: "body",
      acceptLabel: "不再保存",
      cancelLabel: "取消",
    });
    const accept = [...document.querySelectorAll("button")].find(
      (button) => button.textContent === "不再保存",
    );
    accept?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await expect(pending).resolves.toBe(true);
  });

  it("uses the page host as the title", () => {
    expect(neverSaveHost("https://gitlab.example:8443/login", "此网站")).toBe(
      "gitlab.example:8443",
    );
    expect(neverSaveHost("", "此网站")).toBe("此网站");
  });
});

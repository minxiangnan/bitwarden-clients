import { calculateToastTimeout, isShortSuccessToast, SHORT_SUCCESS_TIMEOUT_MS } from "./utils";

describe("Toast default timer", () => {
  it("should have a minimum of 5000ms", () => {
    expect(calculateToastTimeout("")).toBe(5000);
    expect(calculateToastTimeout([""])).toBe(5000);
    expect(calculateToastTimeout(" ")).toBe(5000);
  });

  it("should return an extra second for each 120 words", () => {
    expect(calculateToastTimeout("foo ".repeat(119))).toBe(5000);
    expect(calculateToastTimeout("foo ".repeat(120))).toBe(6000);
    expect(calculateToastTimeout("foo ".repeat(240))).toBe(7000);
    expect(calculateToastTimeout(["foo ".repeat(120), " \n foo ".repeat(120)])).toBe(7000);
  });
});

describe("short success toasts", () => {
  it("treats a one-line success with no title as short", () => {
    expect(isShortSuccessToast({ variant: "success", title: null, message: "密码已复制" })).toBe(
      true,
    );
    expect(SHORT_SUCCESS_TIMEOUT_MS).toBe(1200);
  });

  it("leaves errors, titled notices, and long messages on the regular toast", () => {
    expect(isShortSuccessToast({ variant: "error", message: "同步失败" })).toBe(false);
    expect(
      isShortSuccessToast({ variant: "success", title: "已保存", message: "密码已复制" }),
    ).toBe(false);
    expect(isShortSuccessToast({ variant: "success", message: ["第一行", "第二行"] })).toBe(false);
    expect(isShortSuccessToast({ variant: "success", message: "字".repeat(49) })).toBe(false);
  });
});

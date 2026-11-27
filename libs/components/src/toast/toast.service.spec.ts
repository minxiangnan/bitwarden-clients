import { Subject } from "rxjs";

import { ToastService } from "./toast.service";
import { SHORT_SUCCESS_TIMEOUT_MS } from "./utils";

describe("ToastService", () => {
  function setup() {
    const hidden = new Subject<void>();
    let nextId = 1;
    const shown: {
      id: number;
      config: {
        timeOut?: number;
        toastClass?: string;
        payload?: { compact?: boolean };
        progressBar?: boolean;
      };
    }[] = [];
    const removed: number[] = [];
    const toastr = {
      show: jest.fn(
        (
          _message: string | undefined,
          _title: string | undefined,
          config: (typeof shown)[number]["config"],
        ) => {
          const toast = { toastId: nextId++, onHidden: hidden };
          shown.push({ id: toast.toastId, config });
          return toast;
        },
      ),
      remove: jest.fn((id: number) => {
        removed.push(id);
        return true;
      }),
    };
    return { service: new ToastService(toastr as never), shown, removed, hidden };
  }

  it("replaces a short success toast and resets it to the short timer", () => {
    const { service, shown, removed } = setup();

    service.showToast({ variant: "success", title: null, message: "验证码已复制" });
    service.showToast({ variant: "success", title: null, message: "密码已复制" });

    expect(removed).toEqual([1]);
    expect(shown).toHaveLength(2);
    expect(shown[1].config.timeOut).toBe(SHORT_SUCCESS_TIMEOUT_MS);
    expect(shown[1].config.progressBar).toBe(false);
    expect(shown[1].config.toastClass).toContain("bit-toast-compact");
    expect(shown[1].config.payload?.compact).toBe(true);
    expect(shown[1].config.payload).toEqual(expect.objectContaining({ message: "密码已复制" }));
  });

  it("keeps an error toast visible and on the long timer", () => {
    const { service, shown, removed } = setup();

    service.showToast({ variant: "error", title: null, message: "同步失败" });
    service.showToast({ variant: "error", title: null, message: "无法保存" });

    expect(removed).toEqual([]);
    expect(shown[0].config.timeOut).toBeGreaterThanOrEqual(5000);
    expect(shown[0].config.toastClass).toBeUndefined();
    expect(shown[1].config.payload?.compact).toBe(false);
  });
});

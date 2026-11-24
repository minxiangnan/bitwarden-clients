import { PAGE_SUBMIT_HOOK, installProgrammaticLoginCapture } from "./programmatic-login-capture";

describe("programmatic login capture", () => {
  const originalSubmit = HTMLFormElement.prototype.submit;
  const originalRequestSubmit = HTMLFormElement.prototype.requestSubmit;
  const valueDescriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");

  afterEach(() => {
    HTMLFormElement.prototype.submit = originalSubmit;
    if (originalRequestSubmit) {
      HTMLFormElement.prototype.requestSubmit = originalRequestSubmit;
    }
    delete (HTMLFormElement.prototype as { __zhLoginHook?: boolean }).__zhLoginHook;
    if (valueDescriptor) {
      Object.defineProperty(HTMLInputElement.prototype, "value", valueDescriptor);
    }
    document.documentElement.removeAttribute("data-zh-login-hook");
  });

  it("flushes on a submit event", () => {
    const flush = jest.fn();
    const uninstall = installProgrammaticLoginCapture(document, flush);
    const form = document.createElement("form");
    document.body.append(form);

    form.dispatchEvent(new Event("submit", { bubbles: true }));

    expect(flush).toHaveBeenCalledTimes(1);
    uninstall();
    form.remove();
  });

  it("flushes when the page calls form.submit and remembers a cleared password", () => {
    const flush = jest.fn();
    const uninstall = installProgrammaticLoginCapture(document, flush);
    // jsdom does not execute scripts inserted by the content script.
    new Function(PAGE_SUBMIT_HOOK)();
    const form = document.createElement("form");
    const password = document.createElement("input");
    password.type = "password";
    password.name = "password";
    form.append(password);
    document.body.append(form);

    password.value = "correct horse";
    password.value = "";
    form.submit();

    expect(password.dataset.zhLastValue).toBe("correct horse");
    expect(flush).toHaveBeenCalled();
    uninstall();
    form.remove();
  });
});

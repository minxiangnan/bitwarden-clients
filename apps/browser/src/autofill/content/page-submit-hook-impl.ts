type ExportFunction = (
  fn: (...args: unknown[]) => unknown,
  scope: object,
) => (...args: unknown[]) => unknown;

type HookedFormPrototype = HTMLFormElement & { __zhLoginHook?: boolean };

type PageWindow = Window & {
  HTMLFormElement?: typeof HTMLFormElement;
  HTMLInputElement?: typeof HTMLInputElement;
  Event: typeof Event;
};

/**
 * Installs the login flush hook on the page's own prototypes.
 * Call this with the page window (MAIN world, or Firefox `wrappedJSObject`).
 * It does not create a `<script>` element, so a page `script-src` cannot block it.
 */
export function applyPageSubmitHook(pageWindow: Window): boolean {
  const page = pageWindow as PageWindow;
  const FormProto = page.HTMLFormElement?.prototype as HookedFormPrototype | undefined;
  if (!FormProto) {
    return false;
  }
  if (FormProto.__zhLoginHook) {
    return true;
  }

  const exporter = (globalThis as { exportFunction?: ExportFunction }).exportFunction;
  const expose = <T extends (...args: unknown[]) => unknown>(fn: T): T =>
    (exporter ? exporter(fn as (...args: unknown[]) => unknown, pageWindow) : fn) as T;

  const notify = expose(function (form: HTMLFormElement) {
    try {
      form.dispatchEvent(new page.Event("zh-login-flush", { bubbles: true }));
    } catch {
      // The form can already be detached.
    }
  });

  const submit = FormProto.submit;
  FormProto.submit = expose(function (this: HTMLFormElement, ...args: unknown[]) {
    notify(this);
    return submit.apply(this, args as []);
  }) as typeof FormProto.submit;

  const requestSubmit = FormProto.requestSubmit;
  if (typeof requestSubmit === "function") {
    FormProto.requestSubmit = expose(function (this: HTMLFormElement, ...args: unknown[]) {
      notify(this);
      return requestSubmit.apply(this, args as []);
    }) as typeof FormProto.requestSubmit;
  }

  const inputPrototype = page.HTMLInputElement?.prototype;
  const desc = inputPrototype
    ? Object.getOwnPropertyDescriptor(inputPrototype, "value")
    : undefined;
  if (desc?.set && desc.get && desc.configurable) {
    const set = desc.set;
    const get = desc.get;
    Object.defineProperty(inputPrototype, "value", {
      configurable: true,
      enumerable: desc.enumerable,
      get: expose(function (this: HTMLInputElement) {
        return get.call(this);
      }),
      set: expose(function (this: HTMLInputElement, next: string) {
        const previous = get.call(this);
        set.call(this, next);
        const hint = [this.type, this.name, this.id, this.autocomplete].join(" ").toLowerCase();
        if (!/password|username|email|login|user/.test(hint)) {
          return;
        }
        const remembered = next || previous;
        if (remembered) {
          this.dataset.zhLastValue = String(remembered);
        }
      }),
    });
  }

  FormProto.__zhLoginHook = true;
  return true;
}

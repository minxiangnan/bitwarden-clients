/**
 * Page-world hook. A content script cannot wrap the page's
 * `HTMLFormElement.prototype.submit`, and that method does not fire `submit`.
 * The hook runs in the page, remembers the last login value, and asks the
 * content script to flush before the real submit.
 */
export const PAGE_SUBMIT_HOOK = `(() => {
  const proto = HTMLFormElement.prototype;
  if (proto.__zhLoginHook) {
    return;
  }
  const notify = (form) => {
    try {
      form.dispatchEvent(new Event("zh-login-flush", { bubbles: true }));
    } catch (e) {}
  };
  const submit = proto.submit;
  proto.submit = function () {
    notify(this);
    return submit.apply(this, arguments);
  };
  const requestSubmit = proto.requestSubmit;
  if (typeof requestSubmit === "function") {
    proto.requestSubmit = function () {
      notify(this);
      return requestSubmit.apply(this, arguments);
    };
  }
  const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
  if (desc && desc.set && desc.get && desc.configurable) {
    const set = desc.set;
    const get = desc.get;
    Object.defineProperty(HTMLInputElement.prototype, "value", {
      configurable: true,
      enumerable: desc.enumerable,
      get: function () {
        return get.call(this);
      },
      set: function (next) {
        const previous = get.call(this);
        set.call(this, next);
        const hint = (
          (this.type || "") +
          " " +
          (this.name || "") +
          " " +
          (this.id || "") +
          " " +
          (this.autocomplete || "")
        ).toLowerCase();
        if (!/password|username|email|login|user/.test(hint)) {
          return;
        }
        const remembered = next || previous;
        if (remembered) {
          this.dataset.zhLastValue = remembered;
        }
      },
    });
  }
  proto.__zhLoginHook = true;
})();`;

export function installProgrammaticLoginCapture(doc: Document, flush: () => void): () => void {
  const onFlush = () => flush();
  doc.addEventListener("submit", onFlush, true);
  doc.addEventListener("zh-login-flush", onFlush, true);
  injectPageSubmitHook(doc);
  return () => {
    doc.removeEventListener("submit", onFlush, true);
    doc.removeEventListener("zh-login-flush", onFlush, true);
  };
}

function injectPageSubmitHook(doc: Document) {
  const root = doc.documentElement;
  if (!root || root.getAttribute("data-zh-login-hook") === "1") {
    return;
  }
  const script = doc.createElement("script");
  script.textContent = PAGE_SUBMIT_HOOK;
  (doc.head ?? root).appendChild(script);
  script.remove();
  root.setAttribute("data-zh-login-hook", "1");
}

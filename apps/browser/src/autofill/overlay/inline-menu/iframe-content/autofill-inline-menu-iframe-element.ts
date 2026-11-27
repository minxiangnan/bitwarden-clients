import { AutofillInlineMenuIframeService } from "./autofill-inline-menu-iframe.service";

export class AutofillInlineMenuIframeElement {
  private autofillInlineMenuIframeService: AutofillInlineMenuIframeService;

  constructor(
    element: HTMLElement,
    portName: string,
    initStyles: Partial<CSSStyleDeclaration>,
    iframeTitle: string,
    ariaAlert?: string,
  ) {
    const shadow: ShadowRoot = element.attachShadow({ mode: "closed" });
    this.attachResetStyles(shadow);

    this.autofillInlineMenuIframeService = new AutofillInlineMenuIframeService(
      shadow,
      portName,
      initStyles,
      iframeTitle,
      ariaAlert,
    );
    this.autofillInlineMenuIframeService.initMenuIframe();
  }

  /**
   * Reset rules for pseudo elements such as `::backdrop` or `::before`.
   * A constructed stylesheet is not an inline `<style>`, so a page
   * `style-src 'self'` does not block it. Older environments still get a
   * style element.
   */
  private attachResetStyles(shadow: ShadowRoot) {
    const css = `
      :host::backdrop,
      :host::before,
      :host::after {
        all: initial !important;
        backdrop-filter: none !important;
        filter: none !important;
        inset: auto !important;
        touch-action: auto !important;
        user-select: text !important;
        display: none !important;
        position: relative !important;
        top: auto !important;
        right: auto !important;
        bottom: auto !important;
        left: auto !important;
        transform: none !important;
        transform-origin: 50% 50% !important;
        opacity: 1 !important;
        mix-blend-mode: normal !important;
        isolation: isolate !important;
        z-index: 0 !important;
        background: none !important;
        background-color: transparent !important;
        background-image: none !important;
        width: 0 !important;
        height: 0 !important;
        content: "" !important;
        pointer-events: all !important;
      }
    `;
    if (typeof CSSStyleSheet === "function") {
      try {
        const sheet = new CSSStyleSheet();
        sheet.replaceSync(css);
        shadow.adoptedStyleSheets = [sheet];
        return;
      } catch {
        // jsdom and older browsers fall through to a style element.
      }
    }
    const style = globalThis.document.createElement("style");
    style.textContent = css;
    shadow.prepend(style);
  }

  /**
   * Cleans up the iframe service to prevent memory leaks.
   */
  destroy() {
    this.autofillInlineMenuIframeService?.destroy();
  }
}

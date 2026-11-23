import "../../../../../platform/i18n/force-zh-cn";
import { AutofillOverlayElement } from "../../../../enums/autofill-overlay.enum";

import { AutofillInlineMenuButton } from "./autofill-inline-menu-button";
import "./button.css";

(function () {
  globalThis.customElements.define(AutofillOverlayElement.Button, AutofillInlineMenuButton);
})();

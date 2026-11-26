import { sendRuntimeMessage } from "../../platform/browser/runtime-channel";

(function () {
  sendRuntimeMessage({ command: "triggerAutofillScriptInjection" });
})();

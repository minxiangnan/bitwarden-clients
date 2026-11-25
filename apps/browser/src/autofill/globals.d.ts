import { AutofillInit } from "./content/abstractions/autofill-init";

declare global {
  interface Window {
    bitwardenAutofillInit?: AutofillInit;
  }

  namespace NodeJS {
    interface ProcessEnv {
      BROWSER?: string;
      BW_INCLUDE_CONTENT_SCRIPT_MEASUREMENTS?: string;
      BW_DETECT_SYNC_BOUNDARIES?: string;
    }
  }
}

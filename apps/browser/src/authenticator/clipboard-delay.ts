import { ClearClipboardDelay } from "@bitwarden/common/autofill/constants";
import { ClearClipboardDelaySetting } from "@bitwarden/common/autofill/types";

/** Maps the existing autofill setting onto the clipboard callback's millisecond delay. */
export function clipboardClearMs(
  setting: ClearClipboardDelaySetting | null | undefined,
): number | undefined {
  switch (setting) {
    case ClearClipboardDelay.TenSeconds:
      return 10_000;
    case ClearClipboardDelay.TwentySeconds:
      return 20_000;
    case ClearClipboardDelay.ThirtySeconds:
      return 30_000;
    case ClearClipboardDelay.OneMinute:
      return 60_000;
    case ClearClipboardDelay.TwoMinutes:
      return 120_000;
    case ClearClipboardDelay.FiveMinutes:
      return 300_000;
    default:
      return undefined;
  }
}

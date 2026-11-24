import { SimpleDialogOptions } from "./simple-dialog/types";

/** Title is the thing being destroyed. Empty names fall back to a generic label. */
export function destructiveTitle(name: string | null | undefined, fallback: string): string {
  const trimmed = name?.trim();
  return trimmed ? trimmed : fallback;
}

/**
 * One confirm for every destructive action: danger button, cancel focused,
 * cream card, and a brown scrim. The caller passes already-localized strings
 * so the title can be the item's own name.
 */
export function destructiveDialogOptions(options: {
  title: string;
  content: string;
  acceptText: string;
}): SimpleDialogOptions {
  return {
    title: options.title,
    content: options.content,
    type: "danger",
    acceptButtonText: options.acceptText,
    cancelButtonText: { key: "cancel" },
    focusCancel: true,
  };
}

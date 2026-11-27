/** Short success notices (copy password, username, a code) stay up about this long. */
export const SHORT_SUCCESS_TIMEOUT_MS = 1200;

const SHORT_SUCCESS_MAX_LENGTH = 48;

/**
 * A single short success line, with no title. These are the copy confirmations
 * that should collapse into one capsule instead of stacking.
 */
export function isShortSuccessToast(options: {
  message: string | string[];
  variant?: string;
  title?: string | null;
}): boolean {
  if (options.variant !== "success") {
    return false;
  }
  if (options.title != null && options.title.trim() !== "") {
    return false;
  }
  if (typeof options.message !== "string") {
    return false;
  }
  const message = options.message.trim();
  return message.length > 0 && message.length <= SHORT_SUCCESS_MAX_LENGTH;
}

/**
 * Given a toast message, calculate the ideal timeout length following:
 * a minimum of 5 seconds + 1 extra second per 120 additional words
 *
 * @param message the toast message to be displayed
 * @returns the timeout length in milliseconds
 */
export const calculateToastTimeout = (message: string | string[]): number => {
  const paragraphs = Array.isArray(message) ? message : [message];
  const numWords = paragraphs
    .map((paragraph) => paragraph.split(/\s+/).filter((word) => word !== ""))
    .flat().length;
  return 5000 + Math.floor(numWords / 120) * 1000;
};

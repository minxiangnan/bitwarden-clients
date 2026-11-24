import { ErrorResponse } from "@bitwarden/common/models/response/error.response";

/** Shown when the server refuses an email that was not invited. */
export const invitedAccountRejectedMessage =
  "这个邮箱还没有收到邀请。请让管理员在管理页邀请它，然后再创建账户。";

export function invitedAccountErrorText(error: unknown): string {
  const message =
    error instanceof ErrorResponse
      ? error.getSingleMessage()
      : error instanceof Error
        ? error.message
        : "";
  if (/registration not allowed|user already exists/i.test(message)) {
    return invitedAccountRejectedMessage;
  }
  return message || "创建账户没有成功。";
}

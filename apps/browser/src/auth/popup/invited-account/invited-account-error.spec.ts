import { ErrorResponse } from "@bitwarden/common/models/response/error.response";

import { invitedAccountErrorText, invitedAccountRejectedMessage } from "./invited-account-error";

describe("invitedAccountErrorText", () => {
  it("explains a rejected invite in Chinese", () => {
    const error = new ErrorResponse(
      {
        message: "Registration not allowed or user already exists",
        validationErrors: { "": ["Registration not allowed or user already exists"] },
      },
      400,
    );

    expect(invitedAccountErrorText(error)).toBe(invitedAccountRejectedMessage);
  });

  it("keeps an unrelated server message", () => {
    expect(invitedAccountErrorText(new Error("主密码提示不能包含主密码"))).toBe(
      "主密码提示不能包含主密码",
    );
  });
});

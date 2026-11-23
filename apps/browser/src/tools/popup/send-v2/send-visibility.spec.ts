import { SHOW_SEND } from "./send-visibility";

describe("Send visibility", () => {
  it("hides Send in this private build", () => {
    expect(SHOW_SEND).toBe(false);
  });
});

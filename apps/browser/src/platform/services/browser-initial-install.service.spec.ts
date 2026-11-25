import { mock } from "jest-mock-extended";
import { of } from "rxjs";

import { GlobalState, StateProvider } from "@bitwarden/common/platform/state";

import { BrowserApi } from "../browser/browser-api";

import BrowserInitialInstallService from "./browser-initial-install.service";

describe("BrowserInitialInstallService", () => {
  it("does not open a welcome tab", async () => {
    const stateProvider = mock<StateProvider>();
    const globalState = mock<GlobalState<boolean>>();
    Object.defineProperty(globalState, "state$", { value: of(false) });
    stateProvider.getGlobal.mockReturnValue(globalState);
    const createNewTabSpy = jest.spyOn(BrowserApi, "createNewTab").mockResolvedValue({} as any);

    await new BrowserInitialInstallService(stateProvider).displayWelcomePage();

    expect(createNewTabSpy).not.toHaveBeenCalled();
  });
});

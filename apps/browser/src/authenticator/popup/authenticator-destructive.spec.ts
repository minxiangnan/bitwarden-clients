import { TestBed } from "@angular/core/testing";
import { Router } from "@angular/router";
import { of } from "rxjs";

import { I18nService } from "@bitwarden/common/platform/abstractions/i18n.service";
import { PlatformUtilsService } from "@bitwarden/common/platform/abstractions/platform-utils.service";
import { DialogService, ToastService } from "@bitwarden/components";

import { AuthenticatorToolsComponent } from "./authenticator-tools.component";
import { AuthenticatorUiService } from "./authenticator-ui.service";
import { AuthenticatorService } from "./authenticator.service";
import { McpAccessComponent } from "./mcp-access.component";
import { McpAccessService } from "./mcp-access.service";

describe("authenticator destructive confirms", () => {
  it("does not purge a trashed code when the dialog is cancelled", async () => {
    const remove = jest.fn();
    const openSimpleDialog = jest.fn().mockResolvedValue(false);
    TestBed.overrideComponent(AuthenticatorToolsComponent, { set: { imports: [], template: "" } });
    TestBed.configureTestingModule({
      imports: [AuthenticatorToolsComponent],
      providers: [
        {
          provide: AuthenticatorService,
          useValue: {
            state$: of({
              status: "ready",
              entries: [{ id: "1", name: "ada", issuer: "GitLab", deletedAt: "2026-01-01" }],
            }),
            remove,
          },
        },
        { provide: Router, useValue: { navigate: jest.fn() } },
        { provide: ToastService, useValue: { showToast: jest.fn() } },
        { provide: I18nService, useValue: { t: (key: string) => key } },
        { provide: DialogService, useValue: { openSimpleDialog } },
        { provide: AuthenticatorUiService, useValue: {} },
      ],
    });

    const component = TestBed.createComponent(AuthenticatorToolsComponent).componentInstance;
    await component["purge"]("1");

    expect(openSimpleDialog).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "GitLab · ada",
        type: "danger",
        focusCancel: true,
        acceptButtonText: "authenticatorTrashPermanent",
      }),
    );
    expect(remove).not.toHaveBeenCalled();
  });
});

describe("MCP token confirms", () => {
  function setup() {
    const openSimpleDialog = jest.fn().mockResolvedValue(false);
    const revokeToken = jest.fn();
    const rotateToken = jest.fn();
    const showToast = jest.fn();
    TestBed.overrideComponent(McpAccessComponent, { set: { imports: [], template: "" } });
    TestBed.configureTestingModule({
      imports: [McpAccessComponent],
      providers: [
        {
          provide: McpAccessService,
          useValue: { revokeToken, rotateToken, status: jest.fn(), createToken: jest.fn() },
        },
        {
          provide: AuthenticatorService,
          useValue: { state$: of({ status: "ready", entries: [] }) },
        },
        { provide: ToastService, useValue: { showToast } },
        { provide: I18nService, useValue: { t: (key: string) => key } },
        { provide: DialogService, useValue: { openSimpleDialog } },
        { provide: PlatformUtilsService, useValue: { copyToClipboard: jest.fn() } },
      ],
    });
    return {
      component: TestBed.createComponent(McpAccessComponent).componentInstance,
      openSimpleDialog,
      revokeToken,
      rotateToken,
      showToast,
    };
  }

  it("does not revoke the token when the dialog is cancelled", async () => {
    const { component, openSimpleDialog, revokeToken } = setup();

    await component["revoke"]();

    expect(openSimpleDialog).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "mcpToken",
        type: "danger",
        focusCancel: true,
        acceptButtonText: "mcpRevoke",
      }),
    );
    expect(revokeToken).not.toHaveBeenCalled();
  });

  it("tells the user the token was revoked", async () => {
    const { component, openSimpleDialog, revokeToken, showToast } = setup();
    openSimpleDialog.mockResolvedValue(true);
    revokeToken.mockResolvedValue(undefined);

    await component["revoke"]();

    expect(revokeToken).toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith({
      variant: "success",
      title: null,
      message: "mcpTokenRevoked",
    });
  });
});

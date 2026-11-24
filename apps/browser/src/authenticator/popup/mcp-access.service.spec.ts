import { McpAccessService } from "./mcp-access.service";

describe("McpAccessService", () => {
  function setup() {
    const api = {
      revokeMcpToken: jest.fn(async (): Promise<void> => undefined),
      listMcpEntries: jest.fn(
        async (): Promise<{ source: string; sourceId: string; alias: string }[]> => [
          { source: "authenticator", sourceId: "1", alias: "gh" },
        ],
      ),
    };
    const service = new McpAccessService(api as never, {} as never, {} as never, {} as never);
    return { service, api };
  }

  it("hides aliases locally after the token is revoked", async () => {
    const { service } = setup();

    expect(await service.authenticatorAliases()).toEqual({ "1": "gh" });

    await service.revokeToken();

    expect(await service.authenticatorAliases()).toEqual({});
    expect(await service.findAuthenticator("1")).toBeNull();
  });
});

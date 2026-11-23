import { mock } from "jest-mock-extended";

import { ApiService } from "@bitwarden/common/abstractions/api.service";
import { ErrorResponse } from "@bitwarden/common/models/response/error.response";

import { AuthenticatorApiService, isAuthenticatorUnsupported } from "./authenticator-api.service";

describe("AuthenticatorApiService", () => {
  const apiService = mock<ApiService>();
  const service = new AuthenticatorApiService(apiService);

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it("lists entries from GET /authenticator", async () => {
    apiService.send.mockResolvedValue({
      data: [
        {
          id: "a",
          name: "enc-name",
          secret: "enc-secret",
          algorithm: "SHA256",
          digits: 8,
          period: 45,
          favorite: true,
          sortOrder: 3,
          object: "authenticatorEntry",
        },
      ],
      object: "list",
      continuationToken: null,
    });

    const entries = await service.list();

    expect(apiService.send).toHaveBeenCalledWith("GET", "/authenticator", null, true, true);
    expect(entries[0].id).toBe("a");
    expect(entries[0].algorithm).toBe("SHA256");
    expect(entries[0].digits).toBe(8);
  });

  it("creates an entry with the camelCase request", async () => {
    const request = { name: "enc-name", secret: "enc-secret", algorithm: "SHA1" as const };
    apiService.send.mockResolvedValue({ id: "new", ...request, object: "authenticatorEntry" });

    const created = await service.create(request);

    expect(apiService.send).toHaveBeenCalledWith("POST", "/authenticator", request, true, true);
    expect(created.id).toBe("new");
  });

  it("updates and deletes by id", async () => {
    apiService.send.mockResolvedValue({
      id: "a",
      name: "n",
      secret: "s",
      object: "authenticatorEntry",
    });
    await service.update("a/b", { name: "n", secret: "s" });
    await service.delete("a/b");

    expect(apiService.send).toHaveBeenCalledWith(
      "PUT",
      "/authenticator/a%2Fb",
      { name: "n", secret: "s" },
      true,
      true,
    );
    expect(apiService.send).toHaveBeenCalledWith(
      "DELETE",
      "/authenticator/a%2Fb",
      null,
      true,
      false,
    );
  });

  it("treats only HTTP 404 as an unsupported server", () => {
    expect(isAuthenticatorUnsupported(new ErrorResponse({}, 404))).toBe(true);
    expect(isAuthenticatorUnsupported(new ErrorResponse({}, 500))).toBe(false);
    expect(isAuthenticatorUnsupported(new Error("missing"))).toBe(false);
  });
});

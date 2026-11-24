import { describeServerUrl, isAllowedServerRequestUrl, isLoopbackHostname } from "./server-url";

describe("server url", () => {
  it("treats localhost, 127.0.0.1, and ::1 as loopback", () => {
    expect(isLoopbackHostname("localhost")).toBe(true);
    expect(isLoopbackHostname("LOCALHOST")).toBe(true);
    expect(isLoopbackHostname("vault.localhost")).toBe(true);
    expect(isLoopbackHostname("127.0.0.1")).toBe(true);
    expect(isLoopbackHostname("::1")).toBe(true);
    expect(isLoopbackHostname("[::1]")).toBe(true);
    expect(isLoopbackHostname("example.com")).toBe(false);
    expect(isLoopbackHostname("10.0.0.1")).toBe(false);
  });

  it("allows https everywhere and http only on loopback", () => {
    expect(isAllowedServerRequestUrl("https://vault.example.com/api")).toBe(true);
    expect(isAllowedServerRequestUrl("http://127.0.0.1:8000/api")).toBe(true);
    expect(isAllowedServerRequestUrl("http://localhost:8000/identity")).toBe(true);
    expect(isAllowedServerRequestUrl("http://[::1]:8000/api")).toBe(true);
    expect(isAllowedServerRequestUrl("http://example.com/api")).toBe(false);
    expect(isAllowedServerRequestUrl("http://192.168.1.8:8000")).toBe(false);
  });

  it("describes the login field", () => {
    expect(describeServerUrl("")).toEqual({ status: "empty" });
    expect(describeServerUrl("   ")).toEqual({ status: "empty" });
    expect(describeServerUrl("not a url")).toEqual({ status: "invalid" });
    expect(describeServerUrl("http://")).toEqual({ status: "invalid" });
    expect(describeServerUrl("http://example.com")).toEqual({ status: "https" });
    expect(describeServerUrl("http://localhost:8000")).toEqual({
      status: "ok",
      base: "http://localhost:8000",
    });
    expect(describeServerUrl("http://127.0.0.1:8123/")).toEqual({
      status: "ok",
      base: "http://127.0.0.1:8123",
    });
    expect(describeServerUrl("vault.example.com")).toEqual({
      status: "ok",
      base: "https://vault.example.com",
    });
  });
});

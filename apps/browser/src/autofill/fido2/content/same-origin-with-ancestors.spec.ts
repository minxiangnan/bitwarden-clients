import { isSameOriginWithAncestors } from "./same-origin-with-ancestors";

function frame(origin: string, parent: Window): Window {
  const win = {
    location: { origin },
    parent,
  };
  return win as unknown as Window;
}

describe("isSameOriginWithAncestors", () => {
  it("is true for the top window", () => {
    const top = frame("http://localhost:8771", null as unknown as Window);
    (top as unknown as { parent: Window }).parent = top;

    expect(isSameOriginWithAncestors(top)).toBe(true);
  });

  it("is true for a same-origin iframe", () => {
    const top = frame("http://localhost:8771", null as unknown as Window);
    (top as unknown as { parent: Window }).parent = top;
    const child = frame("http://localhost:8771", top);

    expect(isSameOriginWithAncestors(child)).toBe(true);
  });

  it("is false for a cross-origin iframe", () => {
    const top = frame("http://localhost:8771", null as unknown as Window);
    (top as unknown as { parent: Window }).parent = top;
    const child = frame("http://evil.test", top);

    expect(isSameOriginWithAncestors(child)).toBe(false);
  });

  it("is false when the ancestor location cannot be read", () => {
    const child = {
      location: { origin: "http://localhost:8771" },
      get parent() {
        return {
          get location(): Location {
            throw new Error("cross-origin");
          },
        };
      },
    } as unknown as Window;

    expect(isSameOriginWithAncestors(child)).toBe(false);
  });
});

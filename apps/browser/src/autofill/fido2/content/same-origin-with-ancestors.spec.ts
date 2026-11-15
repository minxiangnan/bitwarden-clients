import { isSameOriginWithAncestors } from "./same-origin-with-ancestors";

type Frame = {
  location: { origin: string };
  parent: Frame;
  top: Frame;
};

function chain(origins: string[]): Frame {
  const frames: Frame[] = origins.map((origin) => ({
    location: { origin },
    parent: undefined as unknown as Frame,
    top: undefined as unknown as Frame,
  }));
  const top = frames[0];
  frames.forEach((frame, index) => {
    frame.top = top;
    frame.parent = index === 0 ? frame : frames[index - 1];
  });
  return frames[frames.length - 1];
}

describe("isSameOriginWithAncestors", () => {
  it("is true for the top window", () => {
    const top = chain(["https://example.com"]);

    expect(isSameOriginWithAncestors(top as unknown as Window)).toBe(true);
  });

  it("is true for a same-origin iframe", () => {
    const iframe = chain(["https://example.com", "https://example.com"]);

    expect(isSameOriginWithAncestors(iframe as unknown as Window)).toBe(true);
  });

  it("is true for a nested same-origin iframe", () => {
    const iframe = chain(["https://example.com", "https://example.com", "https://example.com"]);

    expect(isSameOriginWithAncestors(iframe as unknown as Window)).toBe(true);
  });

  it("is false when an ancestor is cross-origin", () => {
    const iframe = chain(["https://example.com", "https://other.example"]);

    expect(isSameOriginWithAncestors(iframe as unknown as Window)).toBe(false);
  });

  it("is false when a middle ancestor is cross-origin", () => {
    const iframe = chain(["https://example.com", "https://other.example", "https://example.com"]);

    expect(isSameOriginWithAncestors(iframe as unknown as Window)).toBe(false);
  });

  it("is false when reading an ancestor location throws", () => {
    const top = chain(["https://example.com"]);
    const iframe = {
      location: { origin: "https://example.com" },
      top,
      get parent() {
        throw new DOMException(
          "Blocked a frame from accessing a cross-origin frame.",
          "SecurityError",
        );
      },
    };

    expect(isSameOriginWithAncestors(iframe as unknown as Window)).toBe(false);
  });
});

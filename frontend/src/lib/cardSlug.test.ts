import { describe, expect, it } from "vitest";
import { cardSlugToSegment, segmentToCardSlug } from "./cardSlug";

describe("cardSlug", () => {
  it("round-trips a plain slug", () => {
    const segment = cardSlugToSegment("hello_world");
    expect(segmentToCardSlug(segment)).toBe("hello_world");
  });

  it("keeps underscores literal, including a backend dedup suffix", () => {
    // Regression test: resolveCardSlug (internal/serve/slug.go)
    // literally appends "_2" to disambiguate a duplicate slug -- so a
    // URL segment's underscores are never encoded spaces and must
    // never be decoded back into spaces.
    expect(segmentToCardSlug("a_2")).toBe("a_2");
    expect(segmentToCardSlug("hello_world_2")).toBe("hello_world_2");
  });
});

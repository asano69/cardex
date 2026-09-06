import { describe, expect, it } from "vitest";
import { cardTitleToSegment, segmentToCardTitle } from "./cardSlug";

describe("cardSlug", () => {
  it("round-trips a plain title", () => {
    const segment = cardTitleToSegment("hello world");
    expect(segmentToCardTitle(segment)).toBe("hello world");
  });

  it("keeps underscores literal, including a backend dedup suffix", () => {
    // Regression test: resolveUniqueTitle (internal/serve/ydoc.go)
    // literally appends "_2" to disambiguate a duplicate title, and
    // buildTitleAndPreview normalizes spaces to underscores before
    // that -- so a URL segment's underscores are never encoded spaces
    // and must never be decoded back into spaces.
    expect(segmentToCardTitle("a_2")).toBe("a_2");
    expect(segmentToCardTitle("hello_world_2")).toBe("hello_world_2");
  });
});

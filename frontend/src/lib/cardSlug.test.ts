import { describe, expect, it } from "vitest";
import { cardTitleToSegment, segmentToCardTitle } from "./cardSlug";

describe("cardSlug", () => {
  it("round-trips a plain title", () => {
    const segment = cardTitleToSegment("hello world");
    expect(segmentToCardTitle(segment)).toBe("hello world");
  });

  it("keeps a backend dedup suffix literal", () => {
    // Regression test: resolveUniqueTitle (internal/serve/ydoc.go)
    // literally appends "_2" to disambiguate a duplicate title, so
    // opening /issue/a_2 must resolve back to the title "a_2", not
    // "a 2".
    expect(segmentToCardTitle("a_2")).toBe("a_2");
  });

  it("still converts spaces before a dedup suffix", () => {
    expect(segmentToCardTitle("hello_world_2")).toBe("hello world_2");
  });
});

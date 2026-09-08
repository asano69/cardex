import { describe, expect, it } from "vitest";
import { titleToSlug, titleToSegment, segmentToSlug } from "./slugify";

describe("slugify", () => {
  it("collapses spaces into underscores", () => {
    expect(titleToSlug("hello world")).toBe("hello_world");
  });

  it("round-trips a plain title through titleToSegment/segmentToSlug", () => {
    const segment = titleToSegment("hello_world");
    expect(segmentToSlug(segment)).toBe("hello_world");
  });

  it("keeps underscores literal, including a backend dedup suffix", () => {
    // Regression test: resolveUniqueTitleInPot
    // (internal/serve/slug.go) literally appends "_2" to disambiguate
    // a duplicate title -- so a URL segment's underscores are never
    // encoded spaces and must never be decoded back into spaces.
    expect(segmentToSlug("a_2")).toBe("a_2");
    expect(segmentToSlug("hello_world_2")).toBe("hello_world_2");
  });

  it("appends a trailing underscore for a reserved segment", () => {
    expect(titleToSlug("new")).toBe("new_");
    expect(titleToSlug("New")).toBe("New"); // case-sensitive, matches internal/slug.FromTitle
  });
});

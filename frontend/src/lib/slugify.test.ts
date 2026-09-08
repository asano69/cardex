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

  it("collapses consecutive separators into a single underscore", () => {
    // Locks in the collapsing behavior (matching the bracket-strip
    // reference: split(/[\[\] ]+/).filter(Boolean).join("_")) rather
    // than emitting one underscore per separator character.
    expect(titleToSlug("A  B")).toBe("A_B");
    expect(titleToSlug("[A[[B]]")).toBe("A_B");
  });

  it("leaves a stray tab untouched by titleToSlug", () => {
    // Tab is not in the [\[\] ] separator class, so it passes through
    // titleToSlug unchanged -- only titleToSegment's encoding step
    // below is responsible for making it URL-safe.
    expect(titleToSlug("A\tB")).toBe("A\tB");
  });

  it("percent-encodes a stray tab into a URL-safe segment", () => {
    // Regression test: encodeUnsafeChars used to only escape % / # ?,
    // leaving control characters like a tab literal in the URL.
    expect(titleToSegment("A\tB")).toBe("A%09B");
  });

  it("round-trips a tab through titleToSegment/segmentToSlug", () => {
    const segment = titleToSegment("A\tB");
    expect(segmentToSlug(segment)).toBe("A\tB");
  });

  it("leaves printable non-ASCII text like a full-width space unescaped", () => {
    // U+3000 must NOT be treated as a word separator or be
    // percent-encoded -- unlike encodeURIComponent, this keeps such
    // text human-readable in the address bar.
    expect(titleToSegment("A\u3000B")).toBe("A\u3000B");
  });

  it("percent-encodes reserved path characters together", () => {
    expect(titleToSegment("50%/#?")).toBe("50%25%2F%23%3F");
  });
});

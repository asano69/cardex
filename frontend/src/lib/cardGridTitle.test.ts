import { describe, expect, it } from "vitest";
import {
  collapseGridTitleWhitespace,
  deriveCardGridTitle,
} from "./cardGridTitle";
import type { CardRecord } from "../routes/cards/CardForm";

// Phase 3 regression tests: lock in the relationship between a
// resolved card title and the cardGridTitle derived from it. See
// collapseGridTitleWhitespace's own doc comment for the rule: runs of
// ASCII whitespace collapse to a single half-width space; everything
// else (full-width space, underscores, ...) is left untouched.
describe("collapseGridTitleWhitespace (phase 3: title -> cardGridTitle)", () => {
  it("leaves a single half-width space untouched", () => {
    expect(collapseGridTitleWhitespace("A B")).toBe("A B");
  });

  it("collapses a run of half-width spaces into one", () => {
    expect(collapseGridTitleWhitespace("A  B")).toBe("A B");
    expect(collapseGridTitleWhitespace("A   B")).toBe("A B"); // triple space
  });

  it("converts a tab into a single half-width space", () => {
    expect(collapseGridTitleWhitespace("A\tB")).toBe("A B");
  });

  it("collapses mixed ASCII whitespace (space + tab) into one space", () => {
    expect(collapseGridTitleWhitespace("A \t B")).toBe("A B");
  });

  it("does NOT touch a full-width space (U+3000)", () => {
    // Regression test: JS's `\s` would incorrectly match this too --
    // full-width space is intentional Japanese text, not whitespace
    // noise.
    expect(collapseGridTitleWhitespace("A\u3000B")).toBe("A\u3000B");
  });

  it("leaves underscores (including a backend dedup suffix) untouched", () => {
    expect(collapseGridTitleWhitespace("X")).toBe("X");
    expect(collapseGridTitleWhitespace("X_2")).toBe("X_2");
    expect(collapseGridTitleWhitespace("Y_2")).toBe("Y_2");
  });

  it("is a no-op for a bracket-derived title (already single-spaced)", () => {
    // StripBracketLinks (internal/slug/slug.go) already joins words
    // with a single half-width space, so these titles have no
    // consecutive whitespace to collapse in the first place.
    for (const title of [
      "A B X C D",
      "A XB",
      "A B",
      "A",
      "A C",
      "D",
      "Untitled",
    ]) {
      expect(collapseGridTitleWhitespace(title)).toBe(title);
    }
  });
});

describe("deriveCardGridTitle", () => {
  it("applies collapseGridTitleWhitespace to the card's title", () => {
    const card = { title: "A  B" } as CardRecord;
    expect(deriveCardGridTitle(card)).toBe("A B");
  });
});

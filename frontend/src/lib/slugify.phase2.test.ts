import { describe, expect, it } from "vitest";
import { titleToSlug } from "./slugify";

// Phase 2 regression tests: lock in the relationship between a
// resolved card title and the slug titleToSlug derives from it. See
// titleToSlug's own doc comment for the rule: a title with no
// brackets maps each space to its own "_" one-to-one, while a title
// that does contain brackets still collapses any run of
// brackets/spaces into a single "_".
describe("titleToSlug (phase 2: title -> slug)", () => {
  it("maps each space to its own underscore when the title has no brackets", () => {
    expect(titleToSlug("A B")).toBe("A_B"); // single space
    expect(titleToSlug("A  B")).toBe("A__B"); // double space -- must not collapse
  });

  it("still collapses consecutive separators once brackets are present", () => {
    expect(titleToSlug("[A B[X]C D]")).toBe("A_B_X_C_D");
    expect(titleToSlug("[A[XB]")).toBe("A_XB");
    expect(titleToSlug("[D]")).toBe("D");
  });

  it("matches the end-to-end candidate -> title -> slug chain for bracket-derived titles", () => {
    // Locks in titleToSlug's output for titles as they actually look
    // AFTER resolveTitle (internal/serve/slug.go) has already stripped
    // brackets from the original candidate -- no brackets remain, and
    // words are joined by a single half-width space. Both the
    // collapsing and one-to-one paths agree here (a lone space
    // collapses to the same single "_" either way), but this pins the
    // exact chain so a future change to either step can't silently
    // break it.
    const cases: [title: string, want: string][] = [
      ["A B X C D", "A_B_X_C_D"], // from candidate "[A B[X]C D]"
      ["A XB", "A_XB"], // from candidate "[A[XB]"
      ["A B", "A_B"], // from candidate "[[[A[[B]]]"
      ["A", "A"], // from candidate "[A[]]"
      ["Untitled", "Untitled"], // from candidate "[[]]" (empty -> fallback)
      ["A C", "A_C"], // from candidate "[A[[[C]"
      ["D", "D"], // from candidate "[D]"
    ];
    for (const [title, want] of cases) {
      expect(titleToSlug(title)).toBe(want);
    }
  });
});

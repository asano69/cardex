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
});

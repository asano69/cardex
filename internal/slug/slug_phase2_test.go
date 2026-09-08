// Phase 2 regression tests: lock in the relationship between a
// resolved title and the slug FromTitle derives from it.
//
// Rule under test: a title with no brackets maps each space to its
// own "_" one-to-one (so "A B" and "A  B" produce distinguishable
// slugs); a title that does contain brackets still collapses any run
// of brackets/spaces into a single "_" (unchanged from before).
package slug

import "testing"

func TestFromTitle_NoBrackets_SpacesMapOneToOne(t *testing.T) {
	cases := []struct {
		title string
		want  string
	}{
		{"A B", "A_B"},   // single space
		{"A  B", "A__B"}, // double space -- must NOT collapse to "A_B"
	}
	for _, c := range cases {
		if got := FromTitle(c.title); got != c.want {
			t.Errorf("FromTitle(%q) = %q, want %q", c.title, got, c.want)
		}
	}
}

func TestFromTitle_WithBrackets_StillCollapses(t *testing.T) {
	// The one-to-one space rule above only applies when the title has
	// no brackets at all -- a bracketed title still goes through the
	// collapsing path.
	cases := []struct {
		title string
		want  string
	}{
		{"[A B[X]C D]", "A_B_X_C_D"},
		{"[A[XB]", "A_XB"},
		{"[D]", "D"},
	}
	for _, c := range cases {
		if got := FromTitle(c.title); got != c.want {
			t.Errorf("FromTitle(%q) = %q, want %q", c.title, got, c.want)
		}
	}
}

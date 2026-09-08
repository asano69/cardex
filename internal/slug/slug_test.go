package slug

import "testing"

func TestFromTitle_BracketsBecomeUnderscores(t *testing.T) {
	got := FromTitle("[foo]bar[baz]")
	want := "foo_bar_baz"
	if got != want {
		t.Errorf("FromTitle(...) = %q, want %q", got, want)
	}
}

func TestFromTitle_CollapsesConsecutiveSeparators(t *testing.T) {
	got := FromTitle("  [a][b]  c   d  ")
	want := "a_b_c_d"
	if got != want {
		t.Errorf("FromTitle(...) = %q, want %q", got, want)
	}
}

func TestFromTitle_ReservedWordGetsSuffixed(t *testing.T) {
	if got := FromTitle("new"); got != "new_" {
		t.Errorf("FromTitle(\"new\") = %q, want %q", got, "new_")
	}
	// Case sensitivity: only an exact match is reserved.
	if got := FromTitle("New"); got != "New" {
		t.Errorf("FromTitle(\"New\") = %q, want %q", got, "New")
	}
}

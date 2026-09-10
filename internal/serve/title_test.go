// internal/serve/title_test.go
//
// Phase 1 regression tests: lock in the relationship between a title
// candidate (the "lines" value -- see lines.go's position-0 line
// content) and the CardTitle that resolveTitle computes from it.
//
// Rules under test:
//   - When the candidate is unique within its pot, the resolved title
//     is the candidate byte-for-byte: no trimming, no whitespace
//     normalization (that already happened client-side -- see
//     frontend/src/components/noteEditor/titleCandidatePlugin.ts's
//     extractCandidate).
//   - A candidate that collides with an existing title in the same
//     pot gets a numeric "_N" suffix appended (see
//     resolveUniqueTitleInPot).
//   - A candidate that already happens to look like a suffixed title
//     (e.g. "Y_2") is not treated specially -- it only gets a further
//     suffix if it actually collides with something.
//   - An empty candidate resolves to "Untitled".
package serve

import (
	"testing"

	"github.com/pocketbase/pocketbase/core"

	"github.com/asano69/cardpot/internal/slug"
)

func TestResolveTitle_PreservesCandidateWhitespaceVariants(t *testing.T) {
	app := newSlugTestApp(t)

	candidates := []string{
		"A B",      // single half-width space
		"A  B",     // double half-width space
		"A\tB",     // tab
		"A\u3000B", // full-width space
	}

	for _, candidate := range candidates {
		got, err := resolveTitle(app, "pot1", TitleCandidate(candidate), "")
		if err != nil {
			t.Fatalf("resolveTitle(%q): %v", candidate, err)
		}
		if string(got) != candidate {
			t.Errorf("resolveTitle(%q) = %q, want %q (unchanged)", candidate, got, candidate)
		}
	}
}

func TestResolveTitle_CollisionGetsNumericSuffix(t *testing.T) {
	app := newSlugTestApp(t)
	createCard(t, app, "pot1", "X")

	got, err := resolveTitle(app, "pot1", "X", "")
	if err != nil {
		t.Fatalf("resolveTitle: %v", err)
	}
	if got != "X_2" {
		t.Errorf(`resolveTitle("X") = %q, want %q`, got, "X_2")
	}
}

func TestResolveTitle_SuffixLookalikeIsNotDoubleSuffixed(t *testing.T) {
	// "Y_2" is a candidate typed verbatim by the user, unrelated to
	// any existing "Y" card -- it must resolve to itself, not
	// "Y_2_2" or some other mangled form.
	app := newSlugTestApp(t)
	createCard(t, app, "pot1", "X")
	createCard(t, app, "pot1", "X_2")

	got, err := resolveTitle(app, "pot1", "Y_2", "")
	if err != nil {
		t.Fatalf("resolveTitle: %v", err)
	}
	if got != "Y_2" {
		t.Errorf(`resolveTitle("Y_2") = %q, want %q`, got, "Y_2")
	}
}

func TestResolveTitle_EmptyCandidateFallsBackToUntitled(t *testing.T) {
	app := newSlugTestApp(t)

	got, err := resolveTitle(app, "pot1", "", "")
	if err != nil {
		t.Fatalf("resolveTitle: %v", err)
	}
	if got != "Untitled" {
		t.Errorf(`resolveTitle("") = %q, want %q`, got, "Untitled")
	}
}

func TestResolveTitle_ExcludeIDLetsARecordKeepItsOwnTitle(t *testing.T) {
	// A card resolving its own unchanged title must not collide with
	// itself -- excludeID is what makes that possible.
	app := newSlugTestApp(t)
	existing := createCard(t, app, "pot1", "X")

	got, err := resolveTitle(app, "pot1", "X", existing.Id)
	if err != nil {
		t.Fatalf("resolveTitle: %v", err)
	}
	if got != "X" {
		t.Errorf(`resolveTitle("X", excludeID=self) = %q, want %q`, got, "X")
	}
}

func TestResolveTitle_StripsBracketLinkSyntax(t *testing.T) {
	// Regression test: a header typed with Scrapbox-style bracket-link
	// markup must resolve to its plain-word form, not the literal
	// candidate with brackets still attached.
	app := newSlugTestApp(t)

	cases := []struct {
		candidate string
		want      string
	}{
		{"[A B[X]C D]", "A B X C D"},
		{"[A[XB]", "A XB"},
		{"[[[A[[B]]]", "A B"},
		{"[A[]]", "A"},
		{"[[]]", "Untitled"}, // no words at all -- falls back like any empty candidate
		{"[A[[[C]", "A C"},
		{"[D]", "D"},
	}
	for _, c := range cases {
		got, err := resolveTitle(app, "pot1", TitleCandidate(c.candidate), "")
		if err != nil {
			t.Fatalf("resolveTitle(%q): %v", c.candidate, err)
		}
		if string(got) != c.want {
			t.Errorf("resolveTitle(%q) = %q, want %q", c.candidate, got, c.want)
		}
	}
}

// saveResolvedCard resolves a title from candidate and persists both
// "title" and "slug" (mirroring cards.go's createCardHandler /
// updateCardTitleHandler), returning the saved record. Needed because
// resolveTitle alone never touches the DB, but these scenario tests
// care about what actually ends up persisted across repeated saves.
func saveResolvedCard(t *testing.T, app core.App, pot string, candidate TitleCandidate, existing *core.Record) *core.Record {
	t.Helper()
	excludeID := ""
	if existing != nil {
		excludeID = existing.Id
	}
	title, err := resolveTitle(app, pot, candidate, excludeID)
	if err != nil {
		t.Fatalf("resolveTitle(%q): %v", candidate, err)
	}

	record := existing
	if record == nil {
		collection, err := app.FindCollectionByNameOrId("cards")
		if err != nil {
			t.Fatalf("find cards collection: %v", err)
		}
		record = core.NewRecord(collection)
		record.Set("pot", pot)
	}
	record.Set("title", string(title))
	record.Set("slug", slug.FromTitle(string(title)))
	if err := app.Save(record); err != nil {
		t.Fatalf("save card: %v", err)
	}
	return record
}

// TestScenario_SpaceVsUnderscoreNeverCollideOnSlug is a regression
// test for the slug-collision bug: "a b" and "a_b" are different
// titles but normalize to the same slug "a_b" (see
// internal/slug.FromTitle). Confirming the second one must never
// silently share the first one's slug -- it has to get bumped to a
// numbered suffix instead, or the two cards become indistinguishable
// by URL.
func TestScenario_SpaceVsUnderscoreNeverCollideOnSlug(t *testing.T) {
	app := newSlugTestApp(t)

	first := saveResolvedCard(t, app, "pot1", "a b", nil)
	if first.GetString("title") != "a b" || first.GetString("slug") != "a_b" {
		t.Fatalf("first card = title %q slug %q, want title %q slug %q",
			first.GetString("title"), first.GetString("slug"), "a b", "a_b")
	}

	second := saveResolvedCard(t, app, "pot1", "a_b", nil)
	if second.GetString("title") != "a_b_2" || second.GetString("slug") != "a_b_2" {
		t.Fatalf("second card = title %q slug %q, want title %q slug %q",
			second.GetString("title"), second.GetString("slug"), "a_b_2", "a_b_2")
	}
}

// TestScenario_RepeatedCandidateChainBumpsThroughSlugCollisions
// extends the same idea across three successive saves ("a b", then
// "a b" again, then "a_b"), each of which must resolve to a distinct
// slug even though only two distinct raw candidates are ever typed.
func TestScenario_RepeatedCandidateChainBumpsThroughSlugCollisions(t *testing.T) {
	app := newSlugTestApp(t)

	first := saveResolvedCard(t, app, "pot1", "a b", nil)
	if first.GetString("slug") != "a_b" {
		t.Fatalf("first slug = %q, want %q", first.GetString("slug"), "a_b")
	}

	second := saveResolvedCard(t, app, "pot1", "a b", nil)
	if second.GetString("title") != "a b_2" || second.GetString("slug") != "a_b_2" {
		t.Fatalf("second card = title %q slug %q, want title %q slug %q",
			second.GetString("title"), second.GetString("slug"), "a b_2", "a_b_2")
	}

	third := saveResolvedCard(t, app, "pot1", "a_b", nil)
	if third.GetString("title") != "a_b_3" || third.GetString("slug") != "a_b_3" {
		t.Fatalf("third card = title %q slug %q, want title %q slug %q",
			third.GetString("title"), third.GetString("slug"), "a_b_3", "a_b_3")
	}
}

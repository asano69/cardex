//
// Regression tests for the merge-alert spec:
//   - the card's slug has a trailing "_<number>" suffix, AND
//   - stripping that suffix yields a slug that another card in the
//     same pot already has, AND
//   - both cards' headers (card_lines position 0) are the same once
//     whitespace-trimmed.
// All three conditions must hold for findMergeTarget to return a
// non-empty target; the negative-case tests below each disable
// exactly one condition to prove it's actually load-bearing.
package serve

import (
	"testing"

	"github.com/pocketbase/pocketbase/core"
)

// --- Pure-function tests: no DB needed ---

func TestStripSlugSuffix(t *testing.T) {
	cases := []struct {
		slug string
		want string
	}{
		{"p_2", "p"},
		{"p_2_3", "p_2"}, // only one level is stripped per call
		{"p", ""},        // no suffix at all
		{"p_", ""},       // underscore with no digits after it
		{"p_2a", ""},     // suffix isn't purely numeric
		{"_2", ""},       // nothing before the underscore
	}
	for _, c := range cases {
		if got := stripSlugSuffix(c.slug); got != c.want {
			t.Errorf("stripSlugSuffix(%q) = %q, want %q", c.slug, got, c.want)
		}
	}
}

func TestNormalizeSlugCandidate_BracketsBecomeSpaces(t *testing.T) {
	// Regression test: brackets are word separators in slug candidates
	// too, matching title resolution (see normalizeCandidateText).
	got := normalizeSlugCandidate("[foo]bar[baz]")
	want := "foo_bar_baz"
	if got != want {
		t.Errorf("normalizeSlugCandidate(...) = %q, want %q", got, want)
	}
}

func TestNormalizeSlugCandidate_TrimsOuterWhitespaceOnly(t *testing.T) {
	// Regression test: interior whitespace is no longer collapsed --
	// each space (including runs created by adjacent brackets) becomes
	// its own underscore. Only the leading/trailing whitespace is
	// trimmed.
	got := normalizeSlugCandidate("  [a][b]  c   d  ")
	want := "a__b___c___d"
	if got != want {
		t.Errorf("normalizeSlugCandidate(...) = %q, want %q", got, want)
	}
}

func TestHeadersMatch(t *testing.T) {
	cases := []struct {
		a, b string
		want bool
	}{
		{"Hello", "Hello", true},
		{"Hello", "World", false},
		{"Hello  ", "Hello", true},      // trailing half-width spaces
		{"Hello\u3000", "Hello", true},  // trailing full-width space
		{"  Hello", "Hello  ", true},    // leading and trailing both
		{"Hello World", "HelloWorld", false},
	}
	for _, c := range cases {
		if got := headersMatch(c.a, c.b); got != c.want {
			t.Errorf("headersMatch(%q, %q) = %v, want %v", c.a, c.b, got, c.want)
		}
	}
}

// --- findMergeTarget: needs a minimal in-memory app ---

// newSlugTestApp boots a throwaway PocketBase app with just the two
// collections findMergeTarget touches, so these tests don't depend on
// the full production schema (see migrations/*_collections_snapshot.go).
func newSlugTestApp(t *testing.T) core.App {
	t.Helper()

	app := core.NewBaseApp(core.BaseAppConfig{DataDir: t.TempDir()})
	if err := app.Bootstrap(); err != nil {
		t.Fatalf("bootstrap app: %v", err)
	}
	t.Cleanup(func() { _ = app.ResetBootstrapState() })

	cards := core.NewBaseCollection("cards")
	cards.Fields.Add(
		&core.TextField{Name: "pot"},
		&core.TextField{Name: "slug"},
		&core.TextField{Name: "title"},
	)
	if err := app.Save(cards); err != nil {
		t.Fatalf("create cards collection: %v", err)
	}

	cardLines := core.NewBaseCollection("card_lines")
	cardLines.Fields.Add(
		&core.TextField{Name: "card"},
		&core.NumberField{Name: "position"},
		&core.TextField{Name: "content"},
	)
	if err := app.Save(cardLines); err != nil {
		t.Fatalf("create card_lines collection: %v", err)
	}

	return app
}

// createCard inserts a "cards" record and returns it.
func createCard(t *testing.T, app core.App, pot, slug, title string) *core.Record {
	t.Helper()
	collection, err := app.FindCollectionByNameOrId("cards")
	if err != nil {
		t.Fatalf("find cards collection: %v", err)
	}
	record := core.NewRecord(collection)
	record.Set("pot", pot)
	record.Set("slug", slug)
	record.Set("title", title)
	if err := app.Save(record); err != nil {
		t.Fatalf("save card: %v", err)
	}
	return record
}

// setFirstLine inserts this card's position-0 card_lines row, i.e. its
// header (see lines.go: the header is always line 0).
func setFirstLine(t *testing.T, app core.App, cardID, content string) {
	t.Helper()
	collection, err := app.FindCollectionByNameOrId("card_lines")
	if err != nil {
		t.Fatalf("find card_lines collection: %v", err)
	}
	record := core.NewRecord(collection)
	record.Set("card", cardID)
	record.Set("position", 0)
	record.Set("content", content)
	if err := app.Save(record); err != nil {
		t.Fatalf("save card_lines: %v", err)
	}
}

func TestFindMergeTarget_AllConditionsMet(t *testing.T) {
	app := newSlugTestApp(t)

	original := createCard(t, app, "pot1", "p", "p")
	setFirstLine(t, app, original.Id, "Hello")

	dup := createCard(t, app, "pot1", "p_2", "p_2")
	setFirstLine(t, app, dup.Id, "Hello")

	got, err := findMergeTarget(app, "pot1", "p_2", "Hello", dup.Id)
	if err != nil {
		t.Fatalf("findMergeTarget: %v", err)
	}
	if got != "p" {
		t.Errorf("mergeTarget = %q, want %q", got, "p")
	}
}

func TestFindMergeTarget_NoSuffix_NoAlert(t *testing.T) {
	// Condition 1 (slug has a "_<number>" suffix) is false.
	app := newSlugTestApp(t)

	original := createCard(t, app, "pot1", "p", "p")
	setFirstLine(t, app, original.Id, "Hello")

	self := createCard(t, app, "pot1", "p2", "p2")
	setFirstLine(t, app, self.Id, "Hello")

	got, err := findMergeTarget(app, "pot1", "p2", "Hello", self.Id)
	if err != nil {
		t.Fatalf("findMergeTarget: %v", err)
	}
	if got != "" {
		t.Errorf("mergeTarget = %q, want empty (no suffix)", got)
	}
}

func TestFindMergeTarget_StrippedSlugDoesNotExist_NoAlert(t *testing.T) {
	// Condition 2 (stripped slug exists in the same pot) is false.
	app := newSlugTestApp(t)

	self := createCard(t, app, "pot1", "p_2", "p_2")
	setFirstLine(t, app, self.Id, "Hello")

	got, err := findMergeTarget(app, "pot1", "p_2", "Hello", self.Id)
	if err != nil {
		t.Fatalf("findMergeTarget: %v", err)
	}
	if got != "" {
		t.Errorf("mergeTarget = %q, want empty (no such card)", got)
	}
}

func TestFindMergeTarget_StrippedSlugExistsInOtherPot_NoAlert(t *testing.T) {
	// Condition 2 is scoped to the same pot -- a same-slug card in a
	// different pot must not trigger the alert.
	app := newSlugTestApp(t)

	other := createCard(t, app, "pot2", "p", "p")
	setFirstLine(t, app, other.Id, "Hello")

	self := createCard(t, app, "pot1", "p_2", "p_2")
	setFirstLine(t, app, self.Id, "Hello")

	got, err := findMergeTarget(app, "pot1", "p_2", "Hello", self.Id)
	if err != nil {
		t.Fatalf("findMergeTarget: %v", err)
	}
	if got != "" {
		t.Errorf("mergeTarget = %q, want empty (different pot)", got)
	}
}

func TestFindMergeTarget_HeadersDiffer_NoAlert(t *testing.T) {
	// Condition 3 (headers match) is false.
	app := newSlugTestApp(t)

	original := createCard(t, app, "pot1", "p", "p")
	setFirstLine(t, app, original.Id, "Hello")

	dup := createCard(t, app, "pot1", "p_2", "p_2")
	setFirstLine(t, app, dup.Id, "World")

	got, err := findMergeTarget(app, "pot1", "p_2", "World", dup.Id)
	if err != nil {
		t.Fatalf("findMergeTarget: %v", err)
	}
	if got != "" {
		t.Errorf("mergeTarget = %q, want empty (headers differ)", got)
	}
}

func TestFindMergeTarget_HeadersMatchIgnoringWhitespace(t *testing.T) {
	// Condition 3 still holds when the only difference is surrounding
	// whitespace (half-width or full-width).
	app := newSlugTestApp(t)

	original := createCard(t, app, "pot1", "p", "p")
	setFirstLine(t, app, original.Id, "Hello")

	dup := createCard(t, app, "pot1", "p_2", "p_2")
	setFirstLine(t, app, dup.Id, "Hello\u3000")

	got, err := findMergeTarget(app, "pot1", "p_2", "  Hello  ", dup.Id)
	if err != nil {
		t.Fatalf("findMergeTarget: %v", err)
	}
	if got != "p" {
		t.Errorf("mergeTarget = %q, want %q", got, "p")
	}
}

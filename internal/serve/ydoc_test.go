// internal/serve/ydoc_test.go
package serve

import "testing"

func TestBuildTitleAndPreview_KeepsSpacesInTitle(t *testing.T) {
	// Space normalization moved to slug.go's resolveCardSlug -- title
	// is now purely a display label and can contain literal spaces.
	xml := `<doc><heading level="1">a 3</heading></doc>`
	title, _ := buildTitleAndPreview(xml)
	if title != "a 3" {
		t.Errorf("title = %q, want %q", title, "a 3")
	}
}

func TestBuildTitleAndPreview_BracketsBecomeSpaces(t *testing.T) {
	// Regression test: "[" and "]" in the title candidate are treated
	// as word separators (turned into a space), not left as literal
	// punctuation in the resolved title.
	xml := `<doc><heading level="1">[foo]bar[baz]</heading></doc>`
	title, _ := buildTitleAndPreview(xml)
	if title != "foo bar baz" {
		t.Errorf("title = %q, want %q", title, "foo bar baz")
	}
}

func TestBuildTitleAndPreview_CollapsesConsecutiveSeparators(t *testing.T) {
	// Regression test: a run of brackets and/or spaces -- wherever it
	// appears, including the edges -- collapses into a single space
	// rather than being preserved character-for-character.
	xml := `<doc><heading level="1">  [a][b]  c   d  </heading></doc>`
	title, _ := buildTitleAndPreview(xml)
	want := "a b c d"
	if title != want {
		t.Errorf("title = %q, want %q", title, want)
	}
}

func TestBuildTitleAndPreview_PreviewIncludesTitleFallbackParagraph(t *testing.T) {
	// Regression test: when there's no heading, the first paragraph is
	// used as the title fallback. Title derivation must not remove that
	// paragraph from the description -- title and description are independent
	// views over the same paragraph list.
	xml := `<doc><paragraph>first line</paragraph><paragraph>second line</paragraph></doc>`
	title, description := buildTitleAndPreview(xml)
	if title != "first line" {
		t.Errorf("title = %q, want %q", title, "first line")
	}
	want := "first line\nsecond line"
	if description != want {
		t.Errorf("description = %q, want %q", description, want)
	}
}

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

func TestBuildTitleAndPreview_CollapsesAndTrimsWhitespace(t *testing.T) {
	// Regression test: whitespace normalization runs last, after
	// bracket replacement -- runs of 2+ spaces (including ones created
	// by adjacent brackets) collapse to one, and leading/trailing
	// spaces are trimmed.
	xml := `<doc><heading level="1">  [a][b]  c   d  </heading></doc>`
	title, _ := buildTitleAndPreview(xml)
	if title != "a b c d" {
		t.Errorf("title = %q, want %q", title, "a b c d")
	}
}

func TestBuildTitleAndPreview_PreviewIncludesTitleFallbackParagraph(t *testing.T) {
	// Regression test: when there's no heading, the first paragraph is
	// used as the title fallback. Title derivation must not remove that
	// paragraph from the preview -- title and preview are independent
	// views over the same paragraph list.
	xml := `<doc><paragraph>first line</paragraph><paragraph>second line</paragraph></doc>`
	title, preview := buildTitleAndPreview(xml)
	if title != "first line" {
		t.Errorf("title = %q, want %q", title, "first line")
	}
	want := "first line\nsecond line"
	if preview != want {
		t.Errorf("preview = %q, want %q", preview, want)
	}
}

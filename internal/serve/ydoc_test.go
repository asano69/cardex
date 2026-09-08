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

func TestBuildTitleAndPreview_KeepsBracketsLiteral(t *testing.T) {
	// Regression test: the title is kept verbatim, matching the same
	// trimmed text stored in card_lines -- brackets are no longer
	// converted to spaces (that conversion is slug-only, see
	// normalizeSlugCandidate in slug.go).
	xml := `<doc><heading level="1">[foo]bar[baz]</heading></doc>`
	title, _ := buildTitleAndPreview(xml)
	want := TitleCandidate("[foo]bar[baz]")
	if title != want {
		t.Errorf("title = %q, want %q", title, want)
	}
}

func TestBuildTitleAndPreview_PreservesInternalWhitespace(t *testing.T) {
	// Regression test: only leading/trailing whitespace is trimmed --
	// internal whitespace, including runs of spaces, is preserved
	// verbatim so the title matches card_lines exactly.
	xml := `<doc><heading level="1">  A  B  </heading></doc>`
	title, _ := buildTitleAndPreview(xml)
	want := TitleCandidate("A  B")
	if title != want {
		t.Errorf("title = %q, want %q", title, want)
	}
}

func TestBuildTitleAndPreview_PreservesTabsAndFullWidthSpaces(t *testing.T) {
	// Regression test: characters that aren't the ASCII space
	// splitCandidateWords used to key off of -- tabs, full-width
	// spaces -- must also survive untouched now that the title is no
	// longer normalized at all.
	xml := "<doc><heading level=\"1\">A\tB</heading></doc>"
	title, _ := buildTitleAndPreview(xml)
	want := TitleCandidate("A\tB")
	if title != want {
		t.Errorf("title = %q, want %q", title, want)
	}

	xmlFullWidth := `<doc><heading level="1">A　B</heading></doc>`
	titleFullWidth, _ := buildTitleAndPreview(xmlFullWidth)
	wantFullWidth := TitleCandidate("A　B")
	if titleFullWidth != wantFullWidth {
		t.Errorf("title = %q, want %q", titleFullWidth, wantFullWidth)
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

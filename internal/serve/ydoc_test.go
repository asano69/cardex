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

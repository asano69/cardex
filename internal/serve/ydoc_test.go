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

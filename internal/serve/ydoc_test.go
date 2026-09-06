// internal/serve/ydoc_test.go
package serve

import "testing"

func TestBuildTitleAndPreview_NormalizesSpacesInTitle(t *testing.T) {
	xml := `<doc><heading level="1">a 3</heading></doc>`
	title, _ := buildTitleAndPreview(xml)
	if title != "a_3" {
		t.Errorf("title = %q, want %q", title, "a_3")
	}
}

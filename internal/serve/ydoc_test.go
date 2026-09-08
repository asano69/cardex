// internal/serve/ydoc_test.go
package serve

import "testing"

func TestBuildPreview_JoinsParagraphsExcludingHeading(t *testing.T) {
	// The document's title heading is a <heading>, not a <paragraph>,
	// so it's excluded from the description automatically.
	xml := `<doc><heading level="1">Title</heading><paragraph>first line</paragraph><paragraph>second line</paragraph></doc>`
	got := buildPreview(xml)
	want := "first line\nsecond line"
	if got != want {
		t.Errorf("buildPreview(...) = %q, want %q", got, want)
	}
}

func TestBuildPreview_SkipsBlankParagraphs(t *testing.T) {
	xml := `<doc><paragraph>   </paragraph><paragraph>real text</paragraph></doc>`
	got := buildPreview(xml)
	want := "real text"
	if got != want {
		t.Errorf("buildPreview(...) = %q, want %q", got, want)
	}
}

func TestBuildPreview_UnescapesXMLEntities(t *testing.T) {
	xml := `<doc><paragraph>a &amp; b &lt;c&gt;</paragraph></doc>`
	got := buildPreview(xml)
	want := `a & b <c>`
	if got != want {
		t.Errorf("buildPreview(...) = %q, want %q", got, want)
	}
}

func TestBuildPreview_NoParagraphs_EmptyString(t *testing.T) {
	xml := `<doc><heading level="1">Title only</heading></doc>`
	got := buildPreview(xml)
	if got != "" {
		t.Errorf("buildPreview(...) = %q, want empty", got)
	}
}

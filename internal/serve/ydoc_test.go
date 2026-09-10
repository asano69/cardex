// internal/serve/ydoc_test.go
package serve

import "testing"

func TestBuildPreview_JoinsLinesExcludingFirst(t *testing.T) {
	// The first line is the title, so it's excluded from the
	// description automatically.
	text := "Title\nfirst line\nsecond line"
	got := buildPreview(text)
	want := "first line\nsecond line"
	if got != want {
		t.Errorf("buildPreview(...) = %q, want %q", got, want)
	}
}

func TestBuildPreview_SkipsBlankLines(t *testing.T) {
	text := "Title\n   \nreal text"
	got := buildPreview(text)
	want := "real text"
	if got != want {
		t.Errorf("buildPreview(...) = %q, want %q", got, want)
	}
}

func TestBuildPreview_NoBodyLines_EmptyString(t *testing.T) {
	text := "Title only"
	got := buildPreview(text)
	if got != "" {
		t.Errorf("buildPreview(...) = %q, want empty", got)
	}
}

func TestBuildPreview_EmptyText_EmptyString(t *testing.T) {
	got := buildPreview("")
	if got != "" {
		t.Errorf(`buildPreview("") = %q, want empty`, got)
	}
}

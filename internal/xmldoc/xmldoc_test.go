package xmldoc

import "testing"

func TestFirstImageSrc_ReturnsFirstMatch(t *testing.T) {
	xml := `<doc><paragraph>hi</paragraph>` +
		`<image src="https://example.com/a.png"></image>` +
		`<image src="https://example.com/b.png"></image></doc>`
	got := FirstImageSrc(xml)
	want := "https://example.com/a.png"
	if got != want {
		t.Errorf("FirstImageSrc(...) = %q, want %q", got, want)
	}
}

func TestFirstImageSrc_NoImage_EmptyString(t *testing.T) {
	xml := `<doc><paragraph>hi</paragraph></doc>`
	if got := FirstImageSrc(xml); got != "" {
		t.Errorf("FirstImageSrc(...) = %q, want empty", got)
	}
}

func TestFirstImageSrc_AttributeOrderIndependent(t *testing.T) {
	// ToXML sorts attributes alphabetically, so "alt" (when present)
	// comes before "src" -- this must still find the src value.
	xml := `<doc><image alt="a cat" src="https://example.com/cat.png"></image></doc>`
	got := FirstImageSrc(xml)
	want := "https://example.com/cat.png"
	if got != want {
		t.Errorf("FirstImageSrc(...) = %q, want %q", got, want)
	}
}

func TestFirstImageSrc_UnescapesEntities(t *testing.T) {
	xml := `<doc><image src="https://example.com/img?a=1&amp;b=2"></image></doc>`
	got := FirstImageSrc(xml)
	want := "https://example.com/img?a=1&b=2"
	if got != want {
		t.Errorf("FirstImageSrc(...) = %q, want %q", got, want)
	}
}

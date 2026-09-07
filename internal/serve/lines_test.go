package serve

import "testing"

func TestExtractLines_ParagraphsGetOwnLines(t *testing.T) {
	xml := `<doc><paragraph id="a">first</paragraph><paragraph id="b">second</paragraph></doc>`
	lines, err := extractLines(xml)
	if err != nil {
		t.Fatalf("extractLines: %v", err)
	}
	if len(lines) != 2 {
		t.Fatalf("got %d lines, want 2", len(lines))
	}
	if lines[0].id != "a" || lines[0].content != "first" {
		t.Errorf("line 0 = %+v", lines[0])
	}
	if lines[1].id != "b" || lines[1].content != "second" {
		t.Errorf("line 1 = %+v", lines[1])
	}
}

func TestExtractLines_BlockquoteIsNotALine(t *testing.T) {
	// Regression test: a blockquote is a container, not a line -- only
	// the paragraph nested inside it should produce a card_lines entry.
	xml := `<doc><blockquote id="q"><paragraph id="p">quoted text</paragraph></blockquote></doc>`
	lines, err := extractLines(xml)
	if err != nil {
		t.Fatalf("extractLines: %v", err)
	}
	if len(lines) != 1 {
		t.Fatalf("got %d lines, want 1", len(lines))
	}
	if lines[0].id != "p" || lines[0].content != "quoted text" {
		t.Errorf("line 0 = %+v", lines[0])
	}
}

func TestExtractLines_InlineMarksStayInTheSameLine(t *testing.T) {
	// Regression test: a mark element (bold, link, ...) nested inside a
	// textblock must not split or drop that textblock's text.
	xml := `<doc><paragraph id="p">hello <strong>bold</strong> world</paragraph></doc>`
	lines, err := extractLines(xml)
	if err != nil {
		t.Fatalf("extractLines: %v", err)
	}
	if len(lines) != 1 {
		t.Fatalf("got %d lines, want 1", len(lines))
	}
	if lines[0].content != "hello bold world" {
		t.Errorf("content = %q, want %q", lines[0].content, "hello bold world")
	}
}

func TestExtractLines_PositionsFollowDocumentOrder(t *testing.T) {
	xml := `<doc><heading id="h" level="1">Title</heading><paragraph id="p">body</paragraph></doc>`
	lines, err := extractLines(xml)
	if err != nil {
		t.Fatalf("extractLines: %v", err)
	}
	if lines[0].position != 0 || lines[1].position != 1 {
		t.Errorf("positions = %d, %d, want 0, 1", lines[0].position, lines[1].position)
	}
}

func TestHashLineContent_SameContentSameHash(t *testing.T) {
	if hashLineContent("hello") != hashLineContent("hello") {
		t.Error("expected same hash for same content")
	}
	if hashLineContent("hello") == hashLineContent("world") {
		t.Error("expected different hash for different content")
	}
}

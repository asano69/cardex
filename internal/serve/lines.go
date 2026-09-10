// lines.go mirrors every "line" (textblock) of a card's live document
// into the "card_lines" collection, so each line's own "updated"
// timestamp reflects when its content last changed rather than when
// the card as a whole was last edited.
//
// A "line" is any ProseMirror node that can hold text directly --
// paragraph, heading, codeBlock (see defineNoteExtension in
// frontend/src/components/noteEditor/basicExtension.ts) -- not a
// container node like blockquote, list, or table that only groups
// other blocks. Only textblocks get their own card_lines row; a
// blockquote wrapping a paragraph contributes just the paragraph's
// line, not a line of its own.
//
// TODO(codemirror-migration): unused for now. internal/serve/ydoc.go's
// store() no longer calls updateLines -- ProseMirror's per-node "id"
// attribute this relied on (see blockIdPlugin.ts) doesn't exist once
// the editor moves to CodeMirror's plain-text Y.Text. Re-wire this
// once line identity has a new strategy (a Yjs RelativePosition
// anchor per line, or a content-based diff between saves -- see the
// design discussion this migration grew out of).
package serve

import (
	"crypto/sha256"
	"encoding/base64"
	"encoding/xml"
	"fmt"
	"io"
	"strings"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// textblockTags lists every node type in the note editor's schema that
// can hold text directly. Kept in sync manually with
// defineNoteExtension (see basicExtension.ts) -- ProseMirror itself
// exposes this as NodeType.isTextblock, but there's no equivalent
// introspection available on the plain XML string this package works
// from.
var textblockTags = map[string]bool{
	"paragraph": true,
	"heading":   true,
	"codeBlock": true,
}

// docLine is one textblock extracted from a card's live XML: its
// stable block id (see blockIdPlugin.ts), its position among all
// lines (source order), and its own direct text content.
type docLine struct {
	id       string
	position int
	content  string
}

// extractLines walks xmlStr's element tree and returns one docLine per
// textblock element, in document order. Container elements
// (blockquote, list, list_item, table, ...) are descended into but
// never produce a line of their own -- only the textblocks nested
// inside them do. Inline mark elements (bold, italic, links, ...)
// inside a textblock are also descended into, so their text still
// counts toward that line's content.
func extractLines(xmlStr string) ([]docLine, error) {
	decoder := xml.NewDecoder(strings.NewReader(xmlStr))

	var lines []docLine
	var current *docLine
	// Depth of elements open since the current textblock started (1 for
	// the textblock itself, +1 per nested element such as a mark).
	// Zero means "not currently inside a textblock".
	var depth int

	for {
		tok, err := decoder.Token()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("parse card xml: %w", err)
		}

		switch t := tok.(type) {
		case xml.StartElement:
			if depth == 0 && textblockTags[t.Name.Local] {
				depth = 1
				current = &docLine{position: len(lines)}
				for _, attr := range t.Attr {
					if attr.Name.Local == "id" {
						current.id = attr.Value
					}
				}
			} else if depth > 0 {
				depth++
			}
		case xml.EndElement:
			if depth == 0 {
				continue
			}
			depth--
			if depth == 0 && current != nil {
				current.content = strings.TrimSpace(current.content)
				lines = append(lines, *current)
				current = nil
			}
		case xml.CharData:
			if current != nil {
				current.content += string(t)
			}
		}
	}

	return lines, nil
}

// hashLineContent returns a stable digest of a line's content,
// base64-encoded so it fits directly into the "content_hash" text
// field next to the plain "content" value.
func hashLineContent(content string) string {
	sum := sha256.Sum256([]byte(content))
	return base64.StdEncoding.EncodeToString(sum[:])
}

// updateLines syncs the "card_lines" collection with room's live
// text: a line whose content_hash hasn't changed is left untouched
// entirely (no write), so its "updated" timestamp keeps reflecting
// when that line was actually last edited rather than the moment of
// this snapshot. Lines no longer present in the document are deleted.
func (p *ydocPersistence) updateLines(room, xml string) error {
	lines, err := extractLines(xml)
	if err != nil {
		return fmt.Errorf("extract lines: %w", err)
	}

	existing, err := p.app.FindRecordsByFilter(
		"card_lines", "card = {:card}", "created", 0, 0,
		dbx.Params{"card": room},
	)
	if err != nil {
		return err
	}
	byUUID := make(map[string]*core.Record, len(existing))
	for _, record := range existing {
		byUUID[record.GetString("uuid")] = record
	}

	collection, err := p.app.FindCollectionByNameOrId("card_lines")
	if err != nil {
		return err
	}

	seen := make(map[string]bool, len(lines))
	for _, line := range lines {
		if line.id == "" {
			continue // block id not assigned yet (see blockIdPlugin.ts) -- nothing to key this line on
		}
		seen[line.id] = true

		hash := hashLineContent(line.content)
		record := byUUID[line.id]
		if record != nil && record.GetString("content_hash") == hash {
			continue // unchanged -- skip the write so "updated" stays accurate
		}

		if record == nil {
			record = core.NewRecord(collection)
			record.Set("card", room)
			record.Set("uuid", line.id)
		}
		record.Set("position", line.position)
		record.Set("content", line.content)
		record.Set("content_hash", hash)
		if err := p.app.Save(record); err != nil {
			return fmt.Errorf("save line %s: %w", line.id, err)
		}
	}

	for uuid, record := range byUUID {
		if !seen[uuid] {
			if err := p.app.Delete(record); err != nil {
				return fmt.Errorf("delete line %s: %w", uuid, err)
			}
		}
	}

	return nil
}

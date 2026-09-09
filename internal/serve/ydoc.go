// ydoc.go persists each card's Yjs body content as an append-only log
// of updates in the "card_ydocs" collection, one record per increment
// (see the "card" relation field there), following the same pattern
// as y-leveldb and other standard Yjs persistence adapters. Each
// increment is stored as a base64 string in the "payload" text field
// rather than a file, since a single increment is typically only a
// few hundred bytes -- too small for a file field's filesystem
// round-trip and orphan-cleanup cost to be worth it.
// ydocPersistence plugs into ygo's PersistenceAdapter (LoadDoc/
// StoreUpdate) and its context-aware extension
// PersistenceAdapterContext (StoreUpdateContext) so that log seeds a
// room on its first connection and grows with the room's live edits.
//
// Debouncing writes, isolating slow saves to one room at a time, and
// flushing a room before it is evicted or the server shuts down are
// all handled by ygo itself:
//   - Server.PersistCoalesceWindow / PersistCoalesceMaxWait (defaults:
//     2s / 10s) already coalesce StoreUpdate calls per room, so this
//     file doesn't need its own dirty-tracking or ticker.
//   - the last peer disconnecting from a room triggers a durable
//     flush-before-evict on ygo's side.
//   - Server.Shutdown drains any buffered writes, calling
//     StoreUpdateContext with a context cancelled at shutdown so an
//     in-flight save can abort instead of blocking indefinitely.
//
// Since the log would otherwise grow forever, compactIfNeeded merges
// it back down to a single record once it passes compactionThreshold.
package serve

import (
	"context"
	"encoding/base64"
	"fmt"
	"log/slog"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/reearth/ygo/crdt"
	yjsws "github.com/reearth/ygo/provider/websocket"

	"github.com/asano69/cardpot/internal/xmldoc"
)

// compactionThreshold is how many stored increments a room's update
// log can hold before compactIfNeeded merges them into one record.
// Keeps LoadDoc from replaying an ever-growing history on every
// reconnect.
const compactionThreshold = 200

var initYjsServerOnce sync.Once

// initYjsServer creates the shared yjsServer (see handler.go) wired to
// a PocketBase-backed persistence adapter, registers the card-delete
// cleanup hook, and hooks graceful shutdown so ygo's own Shutdown can
// drain pending writes before the process exits. Safe to call more
// than once; only the first call has any effect.
func initYjsServer(app core.App) {
	initYjsServerOnce.Do(func() {
		yjsServer = yjsws.NewServerWithPersistence(&ydocPersistence{app: app})

		// Deleting a card should stop tracking (and drop) its live
		// room too, so a deleted card doesn't linger in memory here
		// once it no longer exists in PocketBase.
		app.OnRecordAfterDeleteSuccess("cards").BindFunc(func(e *core.RecordEvent) error {
			forgetRoom(e.Record.Id)
			return e.Next()
		})

		// TODO: verify core.TerminateEvent's exact shape against the
		// vendored PocketBase version (`go doc
		// github.com/pocketbase/pocketbase/core App.OnTerminate`)
		// before relying on this in production.
		app.OnTerminate().BindFunc(func(e *core.TerminateEvent) error {
			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()
			if err := yjsServer.Shutdown(ctx); err != nil {
				slog.Warn("yjs server shutdown", "error", err)
			}
			return e.Next()
		})
	})
}

// ydocPersistence adapts the "ydoc_updates" collection to ygo's
// PersistenceAdapter and PersistenceAdapterContext interfaces. The
// room name is always a "cards" record id (see NoteEditor.tsx), stored
// on each ydoc_updates record via its "card" relation field.
type ydocPersistence struct {
	app core.App
}

// findUpdateRecords returns every stored increment for room, oldest
// first, so callers can replay or compact them in the order they were
// written.
func (p *ydocPersistence) findUpdateRecords(room string) ([]*core.Record, error) {
	return p.app.FindRecordsByFilter(
		"card_ydocs",
		"card = {:card}",
		"created",
		0, 0,
		dbx.Params{"card": room},
	)
}

// loadUpdates reads the raw update bytes off every stored increment
// for room, oldest first. Each increment is a base64 string in the
// "payload" text field, so no filesystem access is needed anymore.
func (p *ydocPersistence) loadUpdates(room string) ([][]byte, error) {
	records, err := p.findUpdateRecords(room)
	if err != nil {
		return nil, err
	}
	if len(records) == 0 {
		return nil, nil
	}

	updates := make([][]byte, 0, len(records))
	for _, record := range records {
		encoded := record.GetString("payload")
		if encoded == "" {
			continue
		}
		data, err := base64.StdEncoding.DecodeString(encoded)
		if err != nil {
			return nil, fmt.Errorf("decode payload for record %s: %w", record.Id, err)
		}
		updates = append(updates, data)
	}
	return updates, nil
}

// LoadDoc seeds a room by replaying every stored increment for the
// matching card, oldest first, the first time a peer connects to it.
// No stored increments is not an error -- it just means the room
// starts empty (e.g. a brand-new card).
func (p *ydocPersistence) LoadDoc(room string) ([]byte, error) {
	updates, err := p.loadUpdates(room)
	if err != nil {
		return nil, err
	}
	switch len(updates) {
	case 0:
		return nil, nil
	case 1:
		return updates[0], nil
	default:
		return mergeUpdates(updates)
	}
}

// mergeUpdates combines multiple standalone Yjs updates into the
// single update that applying all of them, in order, would produce.
// Only needed here for LoadDoc, when a room's history hasn't been
// compacted down to one record yet.
func mergeUpdates(updates [][]byte) ([]byte, error) {
	doc := crdt.New()
	for _, update := range updates {
		if err := doc.ApplyUpdate(update); err != nil {
			return nil, err
		}
	}
	return doc.EncodeStateAsUpdate(), nil
}

// StoreUpdate is called by ygo's per-room persistence worker, already
// debounced by Server.PersistCoalesceWindow/PersistCoalesceMaxWait
// (coalesced every 2s, forced at least every 10s by default). Unlike
// the old full-snapshot approach, the update bytes ygo hands us are
// saved as-is -- the room's document is never re-encoded on a normal
// save, so a write's cost is proportional to the size of the edit
// rather than the size of the whole document.
func (p *ydocPersistence) StoreUpdate(room string, update []byte) error {
	return p.store(context.Background(), room, update)
}

// StoreUpdateContext is the shutdown-aware variant ygo prefers when
// available (see PersistenceAdapterContext): ctx is cancelled once
// Server.Shutdown begins, so a save still starting at that point can
// abort instead of blocking shutdown.
func (p *ydocPersistence) StoreUpdateContext(ctx context.Context, room string, update []byte) error {
	return p.store(ctx, room, update)
}

// store appends update as a new increment for room, then compacts the
// room's history once it grows past compactionThreshold.
func (p *ydocPersistence) store(ctx context.Context, room string, update []byte) error {
	if len(update) == 0 {
		return nil
	}
	if err := ctx.Err(); err != nil {
		return err // shutting down -- abort before touching the DB
	}

	collection, err := p.app.FindCollectionByNameOrId("card_ydocs")
	if err != nil {
		return err
	}
	record := core.NewRecord(collection)
	record.Set("card", room)
	record.Set("payload", base64.StdEncoding.EncodeToString(update))
	if err := p.app.Save(record); err != nil {
		return err
	}

	// The card's "title"/"description" fields and its per-line
	// card_lines records are both derived from the same live XML
	// snapshot, so it's rendered once here and shared between the two
	// instead of each re-serializing the document. ToXML is called
	// directly, not from inside a doc.Transact callback: its leaf text
	// nodes take the document's read lock internally, which would
	// deadlock under Transact's write lock. Calling it here, right
	// after our own StoreUpdate has returned, matches how
	// compactIfNeeded already calls doc.EncodeStateAsUpdate() directly
	// on the same live doc.
	if doc := yjsServer.GetDoc(room); doc != nil {
		xml := doc.GetXmlFragment("prosemirror").ToXML()
		slog.Debug("card xml", "room", room, "xml", xml)

		// Keep the card's "description" and "image" fields in sync
		// with the room's live text, so PotDetail's card grid (see
		// CardItem.tsx) has something human-readable -- and, if the
		// document has one, a preview image -- to show. "title" is
		// no longer touched here -- it's resolved explicitly from
		// the client's candidate text via the /api/admin/cards
		// routes (see cards.go and slug.go's resolveSlugAndTitle),
		// so it doesn't depend on this periodic snapshot's timing
		// anymore.
		if err := p.updatePreview(room, xml); err != nil {
			slog.Warn("update card preview", "room", room, "error", err)
		}

		// Mirrors every line (textblock) of the document into
		// card_lines, so each line's own "updated" timestamp tracks
		// when that specific line last changed (see lines.go).
		if err := p.updateLines(room, xml); err != nil {
			slog.Warn("update card lines", "room", room, "error", err)
		}
	}

	return p.compactIfNeeded(room)
}

// updatePreview refreshes a card's "description" and "image" fields
// from xml -- the room's live "prosemirror" XmlFragment, already
// serialized once by the caller (see store). "title" and "slug" are
// resolved elsewhere now (see slug.go's resolveSlugAndTitle), not
// here.
func (p *ydocPersistence) updatePreview(room, xml string) error {
	record, err := p.app.FindRecordById("cards", room)
	if err != nil {
		return nil // card may have been deleted concurrently -- skip
	}

	description := buildPreview(xml)
	image := xmldoc.FirstImageSrc(xml)

	descriptionChanged := record.GetString("description") != description
	imageChanged := record.GetString("image") != image
	if !descriptionChanged && !imageChanged {
		return nil // unchanged -- avoid a no-op write and its "updated" bump
	}
	if descriptionChanged {
		record.Set("description", description)
	}
	if imageChanged {
		record.Set("image", image)
	}
	return p.app.Save(record)
}

// descriptionMaxRunes caps how much text buildPreview keeps, counted
// in runes (not bytes) so a card written in Japanese isn't cut
// mid-character.
const descriptionMaxRunes = 120

// paragraphRe pulls out the inner text of every <paragraph> element in a
// ToXML() string, wherever it's nested (directly, or inside a
// <list><paragraph>...>). Non-paragraph blocks (code blocks, ...) are
// skipped on purpose -- good enough for a short card-grid description
// (see CardItem.tsx), not a full-fidelity render. The document's own
// title heading is excluded automatically since it's a <heading>, not
// a <paragraph>.
var paragraphRe = regexp.MustCompile(`(?s)<paragraph[^>]*>(.*?)</paragraph>`)

// buildPreview turns a card's full ToXML() output into a short
// plain-text description: every paragraph, joined by a newline (cut to
// descriptionMaxRunes runes, so line breaks in the editor are
// preserved), skipping blank paragraphs. Unescaped plain text with no
// ellipsis. The title is no longer derived here -- see slug.go's
// resolveSlugAndTitle. Entity-unescaping is shared with xmldoc's own
// image extraction (see xmldoc.UnescapeText).
func buildPreview(xml string) string {
	var paragraphs []string
	for _, m := range paragraphRe.FindAllStringSubmatch(xml, -1) {
		text := strings.TrimSpace(xmldoc.UnescapeText(m[1]))
		if text != "" {
			paragraphs = append(paragraphs, text)
		}
	}
	return truncateRunes(strings.Join(paragraphs, "\n"), descriptionMaxRunes)
}

// truncateRunes cuts s to at most max runes (not bytes), so a card
// written in Japanese isn't cut mid-character.
func truncateRunes(s string, max int) string {
	runes := []rune(s)
	if len(runes) > max {
		runes = runes[:max]
	}
	return string(runes)
}

// compactIfNeeded merges every stored increment for room into a single
// record once their count passes compactionThreshold, so LoadDoc never
// has to replay an unbounded history for a long-lived room. Only
// called right after StoreUpdate, so the room's live doc -- the one
// being edited -- is guaranteed to exist and already holds every
// increment merged together; re-encoding it is equivalent to merging
// every record here, with no separate merge step needed.
func (p *ydocPersistence) compactIfNeeded(room string) error {
	records, err := p.findUpdateRecords(room)
	if err != nil {
		return err
	}
	if len(records) <= compactionThreshold {
		return nil
	}

	doc := yjsServer.GetDoc(room)
	if doc == nil {
		return nil // room isn't loaded right now -- compact next time instead
	}

	collection, err := p.app.FindCollectionByNameOrId("card_ydocs")
	if err != nil {
		return err
	}
	compacted := core.NewRecord(collection)
	compacted.Set("card", room)
	compacted.Set("payload", base64.StdEncoding.EncodeToString(doc.EncodeStateAsUpdate()))
	if err := p.app.Save(compacted); err != nil {
		return err
	}

	for _, record := range records {
		if err := p.app.Delete(record); err != nil {
			return err
		}
	}
	return nil
}

// forgetRoom closes room's live Yjs room, if any. Called when the
// matching card is deleted; its ydoc_updates records are expected to
// cascade-delete via the "card" relation field's cascadeDelete option,
// so only the in-memory room needs cleaning up here.
func forgetRoom(room string) {
	if yjsServer != nil {
		_ = yjsServer.CloseRoom(room, true)
	}
}

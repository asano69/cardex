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
	"database/sql"
	"encoding/base64"
	"errors"
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

	// Keep the card's "title" and "preview" fields in sync with the
	// room's live text, so IssueDetail's card grid (see CardItem.tsx)
	// has something human-readable to show. There is no separate title
	// input anymore -- the document's first block is the title (see
	// components/noteEditor).
	if err := p.updateTitleAndPreview(room); err != nil {
		slog.Warn("update card title/preview", "room", room, "error", err)
	}

	return p.compactIfNeeded(room)
}

// updateTitleAndPreview serializes the room's live "prosemirror"
// XmlFragment (the same root name the frontend uses via
// ydoc.getXmlFragment("prosemirror"), see components/noteEditor) to
// XML, splits that XML into a title and a short plain-text preview
// (see buildTitleAndPreview), and writes both into the matching
// "cards" record. There is no separate title input anymore -- the
// document's first block IS the title (see components/noteEditor).
//
// ToXML is called directly, not from inside a doc.Transact callback: its
// leaf text nodes take the document's read lock internally, which would
// deadlock under Transact's write lock. Calling it here, right after our
// own StoreUpdate has returned, matches how compactIfNeeded already calls
// doc.EncodeStateAsUpdate() directly on the same live doc.
func (p *ydocPersistence) updateTitleAndPreview(room string) error {
	doc := yjsServer.GetDoc(room)
	if doc == nil {
		return nil // room isn't loaded -- nothing to derive yet
	}
	xml := doc.GetXmlFragment("prosemirror").ToXML()
	slog.Debug("card xml", "room", room, "xml", xml)

	record, err := p.app.FindRecordById("cards", room)
	if err != nil {
		return nil // card may have been deleted concurrently -- skip
	}

	title, preview := buildTitleAndPreview(xml)
	title = resolveReservedTitle(title)
	title, err = p.resolveUniqueTitle(record.GetString("issue"), title, room)
	if err != nil {
		return err
	}
	if record.GetString("title") == title && record.GetString("preview") == preview {
		return nil // unchanged -- avoid a no-op write and its "updated" bump
	}
	record.Set("title", title)
	record.Set("preview", preview)
	return p.app.Save(record)
}

// reservedTitle can never be reached via URL: "/:slug/new" always
// opens the draft-creation flow (see frontend/src/lib/router.tsx), so
// a card whose derived title is exactly this string is renamed with a
// trailing underscore before the usual uniqueness check runs.
const reservedTitle = "new"
const reservedTitleFallback = "new_"

func resolveReservedTitle(title string) string {
	if title == reservedTitle {
		return reservedTitleFallback
	}
	return title
}

// resolveUniqueTitle returns `title` unchanged if no other card in
// `issue` already uses it, or `title` with an incrementing "_N" suffix
// appended until a free name is found. `excludeID` is the record's own
// id, so re-saving an unchanged title never collides with itself.
func (p *ydocPersistence) resolveUniqueTitle(issue, title, excludeID string) (string, error) {
	candidate := title
	for suffix := 2; ; suffix++ {
		_, err := p.app.FindFirstRecordByFilter(
			"cards",
			"issue = {:issue} && title = {:title} && id != {:id}",
			dbx.Params{"issue": issue, "title": candidate, "id": excludeID},
		)
		if errors.Is(err, sql.ErrNoRows) {
			return candidate, nil
		}
		if err != nil {
			return "", err
		}
		candidate = fmt.Sprintf("%s_%d", title, suffix)
	}
}

// titleMaxRunes and previewMaxRunes cap how much text
// buildTitleAndPreview keeps, counted in runes (not bytes) so a card
// written in Japanese isn't cut mid-character.
const titleMaxRunes = 80
const previewMaxRunes = 120

// paragraphRe pulls out the inner text of every <paragraph> element in a
// ToXML() string, wherever it's nested (directly, or inside a
// <list><paragraph>...>). Non-paragraph blocks (code blocks, ...) are
// skipped on purpose -- good enough for a short card-grid preview (see
// CardItem.tsx), not a full-fidelity render. The document's own title
// heading is excluded here since it's a <heading>, not a <paragraph>
// (see headingRe below).
var paragraphRe = regexp.MustCompile(`(?s)<paragraph[^>]*>(.*?)</paragraph>`)

// headingRe pulls out the inner text of the document's first-level
// heading. forceFirstHeadingPlugin (see components/noteEditor) enforces
// that the first block is always a level-1 heading, so this heading
// doubles as the card's title.
var headingRe = regexp.MustCompile(`(?s)<heading[^>]*>(.*?)</heading>`)

// xmlUnescaper reverses ygo's own xmlEscapeText/xmlEscapeAttr (crdt
// package), so the preview shows plain "&"/"<"/">" instead of entities.
var xmlUnescaper = strings.NewReplacer(
	"&lt;", "<",
	"&gt;", ">",
	"&quot;", `"`,
	"&apos;", "'",
	"&amp;", "&",
)

// defaultTitle is used when a card's document has no heading or
// paragraph text at all -- e.g. every block was cleared after being
// typed. Duplicate defaults are disambiguated by resolveUniqueTitle
// the same way any other title is (see updateTitleAndPreview).
const defaultTitle = "Untitled"

// buildTitleAndPreview turns a card's full ToXML() output into a title
// and a preview. The document's first-level heading is normally the
// title (see forceFirstHeadingPlugin for why the first block is always
// a heading), with every paragraph becoming the preview (joined by a
// newline and cut to previewMaxRunes runes, so line breaks in the
// editor are preserved in the preview). If no heading is found (e.g. an
// older card synced before forceFirstHeadingPlugin existed), the first
// paragraph is used as the title instead, and only the remaining
// paragraphs go into the preview. Both are unescaped plain text with no
// ellipsis; a blank heading or blank paragraphs are dropped before
// either is built. If nothing usable remains, defaultTitle is used.
func buildTitleAndPreview(xml string) (title, preview string) {
	var paragraphs []string
	for _, m := range paragraphRe.FindAllStringSubmatch(xml, -1) {
		text := strings.TrimSpace(xmlUnescaper.Replace(m[1]))
		if text != "" {
			paragraphs = append(paragraphs, text)
		}
	}

	if m := headingRe.FindStringSubmatch(xml); m != nil {
		title = strings.TrimSpace(xmlUnescaper.Replace(m[1]))
	}
	// Empty heading (e.g. a brand-new card whose title hasn't been
	// typed yet) falls back to the first paragraph too, not just a
	// missing heading tag.
	if title == "" && len(paragraphs) > 0 {
		title = paragraphs[0]
		paragraphs = paragraphs[1:]
	}
	if title == "" {
		title = defaultTitle
	}
	// The "cards" title field must never contain a literal space (see
	// the "title" field's pattern in the collection schema): spaces
	// are always normalized to underscores here, so the heading text
	// itself can still contain spaces freely while the derived title
	// stays a single unspaced token usable as a URL segment. Collisions
	// this creates (e.g. "a test" and "a_test" both normalizing to
	// "a_test") are handled the same way any other collision is, by
	// resolveUniqueTitle below.
	title = strings.ReplaceAll(title, " ", "_")
	title = truncateRunes(title, titleMaxRunes)

	preview = truncateRunes(strings.Join(paragraphs, "\n"), previewMaxRunes)
	return title, preview
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

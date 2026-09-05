// ydoc.go makes PocketBase's "cards.ydoc" field the single source of
// truth for each card's Yjs body content. ydocPersistence plugs into
// the ygo websocket server's PersistenceAdapter hook so that field
// seeds a room on its first connection (LoadDoc) and is kept in sync
// with the room's live state (see the flush loop below). StoreUpdate
// itself only marks a room dirty -- writing PocketBase's file field on
// every keystroke would be far too frequent.
package serve

import (
	"bytes"
	"io"
	"log/slog"
	"sync"
	"time"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/filesystem"
	yjsws "github.com/reearth/ygo/provider/websocket"
)

// ydocFlushInterval is how often every dirty room's current state is
// re-encoded and saved to its card's "ydoc" field.
const ydocFlushInterval = 30 * time.Second

// dirtyRooms holds every room that has received at least one update
// since its last flush. Cleared as each room is flushed (and
// re-marked if that flush fails, so it is retried on the next tick).
var dirtyRooms sync.Map // map[string]struct{}

// lastSnapshot caches the last bytes saved per room, so a flush that
// finds nothing new to save skips the write (and the "updated" bump).
var lastSnapshot sync.Map // map[string][]byte

var initYjsServerOnce sync.Once

// initYjsServer creates the shared yjsServer (see handler.go) wired to
// a PocketBase-backed persistence adapter, registers the card-delete
// cleanup hook, and starts the periodic flush loop. Safe to call more
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

		go func() {
			ticker := time.NewTicker(ydocFlushInterval)
			defer ticker.Stop()
			for range ticker.C {
				flushDirtyRooms(app)
			}
		}()
	})
}

// ydocPersistence adapts PocketBase's "cards" collection to ygo's
// websocket.PersistenceAdapter interface. The room name is always a
// "cards" record id (see NoteEditor.tsx).
type ydocPersistence struct {
	app core.App
}

// LoadDoc seeds a room from the matching card's "ydoc" field the first
// time a peer connects to it. A missing card or field is not an error
// -- it just means the room starts empty (e.g. a brand-new card).
func (p *ydocPersistence) LoadDoc(room string) ([]byte, error) {
	record, err := p.app.FindRecordById("cards", room)
	if err != nil {
		return nil, nil
	}
	filename := record.GetString("ydoc")
	if filename == "" {
		return nil, nil
	}

	fs, err := p.app.NewFilesystem()
	if err != nil {
		return nil, err
	}
	defer fs.Close()

	r, err := fs.GetReader(record.BaseFilesPath() + "/" + filename)
	if err != nil {
		return nil, err
	}
	defer r.Close()

	return io.ReadAll(r)
}

// StoreUpdate only marks the room dirty. Writing PocketBase's "ydoc"
// file field here directly would mean one file write per keystroke;
// the periodic flush loop does the actual save instead, at a far more
// reasonable cadence.
func (p *ydocPersistence) StoreUpdate(room string, _ []byte) error {
	dirtyRooms.Store(room, struct{}{})
	return nil
}

// flushDirtyRooms re-encodes every dirty room's current state and
// saves it to the matching card, then clears the dirty flag. Errors
// are logged rather than fatal: one card's failed flush shouldn't stop
// the others from being saved.
func flushDirtyRooms(app core.App) {
	dirtyRooms.Range(func(key, _ any) bool {
		room, _ := key.(string)
		dirtyRooms.Delete(room)
		if err := flushYdoc(app, room); err != nil {
			slog.Warn("ydoc flush failed", "room", room, "error", err)
			dirtyRooms.Store(room, struct{}{}) // retry on the next tick
		}
		return true
	})
}

// flushYdoc encodes room's current in-memory Yjs state and saves it to
// the matching card's "ydoc" field, skipping the write if the content
// hasn't actually changed since the last flush.
func flushYdoc(app core.App, room string) error {
	doc := yjsServer.GetDoc(room)
	if doc == nil {
		return nil // room was torn down between being marked dirty and now
	}

	update := doc.EncodeStateAsUpdate()
	if prev, ok := lastSnapshot.Load(room); ok && bytes.Equal(prev.([]byte), update) {
		return nil
	}

	record, err := app.FindRecordById("cards", room)
	if err != nil {
		return err
	}

	file, err := filesystem.NewFileFromBytes(update, "ydoc.bin")
	if err != nil {
		return err
	}
	record.Set("ydoc", file)
	if err := app.Save(record); err != nil {
		return err
	}

	lastSnapshot.Store(room, update)
	return nil
}

// forgetRoom drops room's tracked state and closes its live Yjs room,
// if any. Called when the matching card is deleted, so a deleted card
// stops being tracked here instead of lingering in memory forever.
func forgetRoom(room string) {
	dirtyRooms.Delete(room)
	lastSnapshot.Delete(room)
	if yjsServer != nil {
		_ = yjsServer.CloseRoom(room, true)
	}
}

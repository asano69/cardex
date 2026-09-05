// ydoc.go makes PocketBase's "cards.ydoc" field the single source of
// truth for each card's Yjs body content. ydocPersistence plugs into
// ygo's PersistenceAdapter (LoadDoc/StoreUpdate) and its context-aware
// extension PersistenceAdapterContext (StoreUpdateContext) so that
// field seeds a room on its first connection and is kept in sync with
// the room's live state.
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
// This file's only job is turning one room's current state into a
// PocketBase record write, and back.
package serve

import (
	"bytes"
	"context"
	"io"
	"log/slog"
	"sync"
	"time"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/filesystem"
	yjsws "github.com/reearth/ygo/provider/websocket"
)

// lastSnapshot caches the last bytes saved per room, so a StoreUpdate
// call that finds nothing new to save (e.g. a duplicate wakeup) skips
// the write, and the "updated" bump that would come with it.
var lastSnapshot sync.Map // map[string][]byte

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

// ydocPersistence adapts PocketBase's "cards" collection to ygo's
// PersistenceAdapter and PersistenceAdapterContext interfaces. The
// room name is always a "cards" record id (see NoteEditor.tsx).
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

// StoreUpdate is called by ygo's per-room persistence worker, already
// debounced by Server.PersistCoalesceWindow/PersistCoalesceMaxWait
// (coalesced every 2s, forced at least every 10s by default). The
// incoming update bytes are ignored: PocketBase's "ydoc" field holds a
// full snapshot rather than an update log, so the room's current full
// state is re-encoded and saved instead.
func (p *ydocPersistence) StoreUpdate(room string, _ []byte) error {
	return p.store(context.Background(), room)
}

// StoreUpdateContext is the shutdown-aware variant ygo prefers when
// available (see PersistenceAdapterContext): ctx is cancelled once
// Server.Shutdown begins, so a save still starting at that point can
// abort instead of blocking shutdown.
func (p *ydocPersistence) StoreUpdateContext(ctx context.Context, room string, _ []byte) error {
	return p.store(ctx, room)
}

// store re-encodes room's current in-memory Yjs state and saves it to
// the matching card's "ydoc" field, skipping the write if the content
// hasn't actually changed since the last save.
func (p *ydocPersistence) store(ctx context.Context, room string) error {
	doc := yjsServer.GetDoc(room)
	if doc == nil {
		return nil // room was torn down between being queued and now
	}

	update := doc.EncodeStateAsUpdate()
	if prev, ok := lastSnapshot.Load(room); ok && bytes.Equal(prev.([]byte), update) {
		return nil
	}

	if err := ctx.Err(); err != nil {
		return err // shutting down -- abort before touching the DB
	}

	record, err := p.app.FindRecordById("cards", room)
	if err != nil {
		return err
	}

	file, err := filesystem.NewFileFromBytes(update, "ydoc.bin")
	if err != nil {
		return err
	}
	record.Set("ydoc", file)
	if err := p.app.Save(record); err != nil {
		return err
	}

	lastSnapshot.Store(room, update)
	return nil
}

// forgetRoom drops room's cached snapshot and closes its live Yjs
// room, if any. Called when the matching card is deleted, so a
// deleted card stops being tracked here instead of lingering in
// memory forever.
func forgetRoom(room string) {
	lastSnapshot.Delete(room)
	if yjsServer != nil {
		_ = yjsServer.CloseRoom(room, true)
	}
}

// ydoc.go periodically saves each open card's in-memory Yjs document
// to its "ydoc" file field, so content survives a server restart and
// NoteEditor has something real to seed from (see the snapshotUrl
// handling in frontend/src/components/noteEditor/index.tsx).
package serve

import (
	"bytes"
	"log/slog"
	"sync"
	"time"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/filesystem"
)

// ydocSnapshotInterval is how often every known room is checked and,
// if its content changed, saved.
const ydocSnapshotInterval = 30 * time.Second

// knownRooms remembers every room ("cards" record id) a peer has ever
// connected to over "/yjs/{room}" (see registerRoutes in handler.go),
// so the snapshot loop knows which cards to check. Never pruned --
// rooms are just card ids, so for a single-user app the set stays
// small and cheap to scan every tick.
var knownRooms sync.Map // map[string]struct{}

// lastSnapshot caches the last bytes saved per room, so an unchanged
// document is not re-saved (and its "updated" timestamp not bumped)
// on every tick.
var lastSnapshot sync.Map // map[string][]byte

// rememberRoom marks a room as known so the snapshot loop picks it up.
func rememberRoom(room string) {
	knownRooms.Store(room, struct{}{})
}

// ydocSnapshotOnce ensures the snapshot loop is only started once,
// even if registerRoutes were ever invoked more than once.
var ydocSnapshotOnce sync.Once

// startYdocSnapshotLoop starts the background snapshot loop. Safe to
// call more than once; only the first call has any effect.
func startYdocSnapshotLoop(app core.App) {
	ydocSnapshotOnce.Do(func() {
		go func() {
			ticker := time.NewTicker(ydocSnapshotInterval)
			defer ticker.Stop()
			for range ticker.C {
				snapshotAllRooms(app)
			}
		}()
	})
}

// snapshotAllRooms snapshots every known room. Errors are logged
// rather than fatal: one card's failed snapshot shouldn't stop the
// others from being saved.
func snapshotAllRooms(app core.App) {
	knownRooms.Range(func(key, _ any) bool {
		room, _ := key.(string)
		if err := snapshotYdoc(app, room); err != nil {
			slog.Warn("ydoc snapshot failed", "room", room, "error", err)
		}
		return true
	})
}

// snapshotYdoc encodes room's current in-memory Yjs state and saves it
// to the matching card's "ydoc" field, skipping the write if the room
// has no live document yet or its content hasn't changed since the
// last snapshot.
func snapshotYdoc(app core.App, room string) error {
	doc := yjsServer.GetDoc(room)
	if doc == nil {
		return nil // no live room -- nothing to snapshot
	}

	update := doc.EncodeStateAsUpdate()
	if prev, ok := lastSnapshot.Load(room); ok && bytes.Equal(prev.([]byte), update) {
		return nil // unchanged since the last snapshot
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

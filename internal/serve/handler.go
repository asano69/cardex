package serve

import (
	"net/http"

	"github.com/asano69/cardex/internal/static"
	"github.com/asano69/cardex/internal/version"

	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"

	yjsws "github.com/reearth/ygo/provider/websocket"
)

// yjsServer is a single in-memory Yjs sync server shared by every room.
// PoC only (see docs/yjs-design.md): no auth yet -- a room's live state
// is still purely in-memory, but it is periodically snapshotted to the
// matching card's "ydoc" field (see ydoc.go) so content survives a
// restart and NoteEditor has something to seed from.
var yjsServer = yjsws.NewServer()

// registerRoutes wires up every HTTP route served by cardex. It is passed
// to app.OnServe().BindFunc in serve.go, keeping all route/handler
// definitions in this file while serve.go stays focused on server setup
// and startup.
func registerRoutes(e *core.ServeEvent) error {
	// Public routes: no auth required. Keep this list limited to
	// endpoints that return no user data (version info, health checks,
	// the static SPA shell below).
	e.Router.GET("/api/version", func(re *core.RequestEvent) error {
		return re.JSON(http.StatusOK, map[string]string{"version": version.Version})
	})

	e.Router.GET("/health", func(re *core.RequestEvent) error {
		return re.JSON(http.StatusOK, map[string]string{"status": "ok"})
	})

	// PoC: real-time Yjs sync (see docs/yjs-design.md). Intentionally
	// unauthenticated for now -- {room} is any client-chosen room name.
	// TODO: gate behind RequireSuperuserAuth once the design is validated.
	//
	// The room name doubles as the "cards" record id (see
	// NoteEditor.tsx), so every connection attempt is remembered here;
	// the snapshot loop in ydoc.go uses that list to know which cards
	// to check.
	yjsHandler := apis.WrapStdHandler(yjsServer)
	e.Router.GET("/yjs/{room}", func(re *core.RequestEvent) error {
		rememberRoom(re.Request.PathValue("room"))
		return yjsHandler(re)
	})

	// Custom API routes that return or mutate user data go under this
	// group so RequireSuperuserAuth only has to be declared once here,
	// instead of on every individual route.
	admin := e.Router.Group("/api/admin")
	admin.Bind(apis.RequireSuperuserAuth())
	// e.g. admin.POST("/jobs/rescan", rescanHandler)

	// Serves the whole Vite build output (index.html, hashed JS/CSS
	// under assets/, and public/ files like favicon.svg copied to the
	// root) from a single route. indexFallback=true makes any unmatched
	// path (e.g. /manifests/abc, /settings) fall back to index.html, so
	// Solid Router can handle it client-side even on a hard refresh.
	// This shell is left unauthenticated on purpose: it's an empty
	// HTML/JS bundle with no data in it. Every route that actually
	// returns collection data is guarded below with
	// RequireSuperuserAuth, so an unauthenticated visitor only ever
	// sees the login screen the SPA renders client-side.
	e.Router.GET("/{path...}", apis.Static(static.FS, true))

	startYdocSnapshotLoop(e.App)

	return e.Next()
}

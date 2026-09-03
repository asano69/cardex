package serve

import (
	"net/http"

	"github.com/asano69/myapp/internal/static"
	"github.com/asano69/myapp/internal/version"

	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
)

// registerRoutes wires up every HTTP route served by myapp. It is passed
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

	return e.Next()
}

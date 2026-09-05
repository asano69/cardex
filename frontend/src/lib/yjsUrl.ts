// Builds the base URL WebsocketProvider connects to for Yjs sync (see
// internal/serve/handler.go's "/yjs/{room}" route).
//
// In dev, Vite's WebSocket proxy is unreliable with multiple concurrent
// connections to the same route (confirmed: a second real client gets
// refused through the port 3001 dev-server proxy, even though the same
// route works fine when hit directly on port 3000). So in dev we skip
// the proxy entirely and connect straight to the Go backend. In
// production, frontend and backend share one origin, so this is just
// the current host.
export function yjsBaseUrl(): string {
  const wsProtocol = location.protocol === "https:" ? "wss:" : "ws:";
  const host = import.meta.env.DEV ? "127.0.0.1:3000" : location.host;
  return `${wsProtocol}//${host}/yjs`;
}

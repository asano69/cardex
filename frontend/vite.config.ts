// frontend/vite.config.ts
import { defineConfig, type Plugin } from "vite";
import solid from "vite-plugin-solid";
import tailwindcss from "@tailwindcss/vite";

// Single source of truth for this build: also read by __APP_NAME__ below
// and by the index.html %APP_NAME% placeholder, so the value only has to
// be resolved once. Backed by the same APP_NAME the Go backend reads
// (see cardex.env), so both sides agree without duplicating the value.
const appName = process.env.APP_NAME;

// index.html isn't JS, so Vite's `define` (below) can't reach it;
// this replaces the %APP_NAME% placeholder at build/serve time
// instead, without widening envPrefix to expose non-VITE_ vars.
const injectAppNameHtml: Plugin = {
  name: "inject-app-name-html",
  transformIndexHtml(html) {
    return html.replace(/%APP_NAME%/g, appName ?? "");
  },
};

export default defineConfig({
  optimizeDeps: {
    // Every prosekit subpath used anywhere in the app must be listed
    // here so Vite pre-bundles them together from a single dependency
    // scan at startup. Otherwise, a subpath first imported later in a
    // dev session (e.g. prosekit/extensions/readonly, only used on the
    // notes list page) gets pre-bundled on its own, producing a second,
    // reference-distinct copy of prosekit/core's internals -- which
    // then fails prosekit's internal `assert(a.facet === b.facet)`
    // check when combining extensions via union().
    include: [
      "prosekit/core",
      "prosekit/basic",
      "prosekit/extensions/readonly",
    ],
  },
  plugins: [solid(), tailwindcss(), injectAppNameHtml],
  // __APP_NAME__ is a build-time constant (not a runtime env var), so it
  // can be referenced anywhere in src/ without an import.
  define: {
    __APP_NAME__: JSON.stringify(appName),
  },
  server: {
    host: "0.0.0.0",
    port: 3001,
    allowedHosts: true,
    proxy: {
      // Use 127.0.0.1 explicitly to avoid localhost resolving to ::1 (IPv6)
      // while PocketBase only listens on 127.0.0.1 (IPv4).
      "/api": { target: "http://127.0.0.1:3000", changeOrigin: true },
      "/_": { target: "http://127.0.0.1:3000", changeOrigin: true },
      "/health": { target: "http://127.0.0.1:3000", changeOrigin: true },

      // configure() rewrites the outgoing Origin header to match the
      // proxy target: the backend's websocket upgrader (gorilla/
      // websocket's default CheckOrigin) rejects any handshake whose
      // Origin doesn't match the Host it receives. changeOrigin only
      // rewrites Host, not Origin, so without this every real
      // cross-origin connection (i.e. anything going through this dev
      // proxy) fails the handshake -- this is the actual cause behind
      // the CONNECTION_REFUSED errors seen when two clients on
      // different origins try to sync.
      "/yjs/": {
        target: "http://127.0.0.1:3000",
        changeOrigin: true,
        ws: true,
        configure: (proxy) => {
          proxy.on("proxyReqWs", (proxyReq) => {
            proxyReq.setHeader("origin", "http://127.0.0.1:3000");
          });
        },
      },
    },
  },
  build: {
    outDir: "../internal/static/dist",
    emptyOutDir: true,
    // Lightning CSS's minifier reorders same-specificity utility rules
    // during optimization, which flips which rule wins the cascade.
    // Tailwind v4 relies on source order to break specificity ties, so
    // this broke Kobalte's menu background/border styles in production
    // builds only (dev serves unminified CSS, so it never showed there).
    // esbuild's minifier doesn't reorder rules, so it avoids the bug
    // while still actually minifying the output (unlike cssMinify: false).
    cssMinify: "esbuild",
  },
});

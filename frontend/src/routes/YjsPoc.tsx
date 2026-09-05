// frontend/src/routes/YjsPoc.tsx
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { ySyncPlugin } from "y-prosemirror";

import "prosekit/basic/style.css";
import "prosekit/basic/typography.css";
import { defineBasicExtension } from "prosekit/basic";
import { createEditor } from "prosekit/core";

// Fixed room name for this proof of concept -- there is no per-card
// room yet (see docs/yjs-design.md section 4). No persistence: once
// every tab closes, the document is gone.
const ROOM = "yjs-poc-test-room";

// PoC page for docs/yjs-design.md: verifies that a ProseKit editor can
// sync in real time through ygo's WebSocket server. Open this page in
// two tabs and type in both; edits should merge without conflicts.
//
// Unauthenticated and unpersisted on purpose at this stage. Also, no
// dedicated ProseKit "yjs extension" was found, so the y-prosemirror
// sync plugin is spliced directly into the ProseMirror state that
// prosekit's createEditor already built, instead of going through
// prosekit's own extension composition.
export default function YjsPoc() {
  const ydoc = new Y.Doc();
  const fragment = ydoc.getXmlFragment("prosemirror");

  // WebsocketProvider builds the connection URL as `${base}/${room}`.
  // The "/yjs" prefix is proxied to the Go backend's "/yjs/{room}"
  // route (see vite.config.ts, which also rewrites the Origin header
  // so the backend's same-origin websocket check passes).
  const wsProtocol = location.protocol === "https:" ? "wss:" : "ws:";
  const provider = new WebsocketProvider(
    `${wsProtocol}//${location.host}/yjs`,
    ROOM,
    ydoc,
  );

  const editor = createEditor({ extension: defineBasicExtension() });

  const mountEditor = (el: HTMLDivElement) => {
    const unmount = editor.mount(el);

    // Splice the yjs sync plugin into the state prosekit already
    // built. NOTE: this assumes `editor.view` exposes the underlying
    // ProseMirror EditorView -- unverified against a running app,
    // adjust if prosekit's actual API differs.
    const state = editor.view.state;
    editor.view.updateState(
      state.reconfigure({ plugins: [ySyncPlugin(fragment), ...state.plugins] }),
    );

    return () => {
      provider.destroy();
      ydoc.destroy();
      if (typeof unmount === "function") unmount();
    };
  };

  return (
    <div class="m-6 flex min-h-0 w-full flex-1 flex-col gap-4">
      <h1 class="font-sans text-2xl">Yjs sync proof of concept</h1>
      <p class="text-sm text-border">
        Open this page in two tabs and type in both -- edits should merge in
        real time. No persistence: refreshing every tab loses the document.
      </p>
      <div
        ref={mountEditor}
        class="ProseMirror flex-1 overflow-y-auto border border-border bg-field p-4 text-text outline-none"
      />
    </div>
  );
}

import { onCleanup } from "solid-js";
// Only style.css (structural/functional editor CSS) is needed here.
// typography.css layers its own opinionated heading/paragraph styles
// on top, which conflict with this app's own overrides in
// styles/components.css (.ProseMirror p/h1-h6/blockquote) -- this app
// re-implements all the typography it needs there instead.
import "prosekit/basic/style.css";
import { defineBasicExtension } from "prosekit/basic";
import { createEditor } from "prosekit/core";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { ySyncPlugin } from "y-prosemirror";
import { keymap } from "prosemirror-keymap";
import { chainCommands } from "prosemirror-commands";
import { createWrapInListCommand, listKeymap } from "prosemirror-flat-list";
import { forceFirstHeadingPlugin } from "./forceFirstHeadingPlugin";

export interface NoteEditorProps {
  // The card's PocketBase record id, doubling as the Yjs room name
  // (see docs/yjs-design.md). Always defined -- CardForm creates the
  // record (and therefore the room) before this component is ever
  // mounted, so there's no "no card yet" state to handle here anymore.
  cardId: () => string;
}

// A single Yjs-synced ProseKit editor covering both title and body:
// the document's first block is the title (styled larger via
// ".ProseMirror > :first-child" in styles/components.css), everything
// below it is the body. Neither is persisted to PocketBase directly --
// both only live in the server's in-memory Yjs room (see
// internal/serve/handler.go). The "title" and "preview" fields shown
// elsewhere (e.g. CardItem's grid) are derived server-side from this
// same room's content (see internal/serve/ydoc.go), not saved from
// here.
export default function NoteEditor(props: NoteEditorProps) {
  const ydoc = new Y.Doc();
  const fragment = ydoc.getXmlFragment("prosemirror");

  // WebsocketProvider builds the connection URL as `${base}/${room}`.
  // The "/yjs" prefix is proxied to the Go backend's "/yjs/{room}"
  // route (see vite.config.ts, which also rewrites the Origin header
  // so the backend's same-origin websocket check passes).
  const wsProtocol = location.protocol === "https:" ? "wss:" : "ws:";
  const provider = new WebsocketProvider(
    `${wsProtocol}//${location.host}/yjs`,
    props.cardId(),
    ydoc,
  );

  const editor = createEditor({ extension: defineBasicExtension() });

  // Solid doesn't auto-unmount ref callbacks the way React's new
  // ref-cleanup convention does, so the returned unmount function is
  // wired to onCleanup explicitly here.
  const mountEditor = (el: HTMLDivElement) => {
    const unmount = editor.mount(el);

    // Tab/Shift-Tab hotkeys, active only while this ProseMirror
    // instance has focus: Tab turns the current block into a bullet
    // list, or indents it one level deeper if it's already a list
    // item (prosemirror-flat-list's own "Mod-]" indent command);
    // Shift-Tab dedents a list item back out ("Mod-["), and is a
    // no-op outside a list. Ordered lists aren't used in this
    // project, so only "bullet" is wired up here.
    const listTabKeymap = keymap({
      Tab: chainCommands(
        listKeymap["Mod-]"],
        createWrapInListCommand({ kind: "bullet" }),
      ),
      "Shift-Tab": listKeymap["Mod-["],
    });

    // Splice the yjs sync plugin into the state prosekit already
    // built. The doc always starts empty here: nothing is loaded from
    // PocketBase, only whatever the room already holds (nothing, for
    // a brand-new card).
    const state = editor.view.state;
    editor.view.updateState(
      state.reconfigure({
        plugins: [
          ySyncPlugin(fragment),
          listTabKeymap,
          forceFirstHeadingPlugin(),
          ...state.plugins,
        ],
      }),
    );

    // Autofocus straight into the editor -- there's no separate title
    // field to focus instead anymore.
    editor.view.focus();

    onCleanup(() => {
      provider.destroy();
      ydoc.destroy();
      if (typeof unmount === "function") unmount();
    });
  };

  return (
    <div class="min-w-0 flex-1 p-10 bg-field shadow-md">
      <div
        ref={mountEditor}
        class="ProseMirror flex-1 overflow-y-auto text-text outline-none"
      />
    </div>
  );
}

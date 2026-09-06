import { onCleanup } from "solid-js";
// Only style.css (structural/functional editor CSS) is needed here.
// typography.css layers its own opinionated heading/paragraph styles
// on top, which conflict with this app's own overrides in
// styles/components.css (.ProseMirror p/h1-h6/blockquote) -- this app
// re-implements all the typography it needs there instead.
import "prosekit/basic/style.css";
import { createEditor, union } from "prosekit/core";
import { defineNoteExtension } from "./basicExtension";
import { defineUrlLinkRule } from "./urlLinkRule";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { ySyncPlugin } from "y-prosemirror";
import { keymap } from "prosemirror-keymap";
import { chainCommands } from "prosemirror-commands";
import { createWrapInListCommand, listKeymap } from "prosemirror-flat-list";
import { forceFirstHeadingPlugin } from "./forceFirstHeadingPlugin";
import { headingPlaceholderPlugin } from "./headingPlaceholderPlugin";
import { linkClickPlugin } from "./linkClickPlugin";
import { blockIdPlugin } from "./blockIdPlugin";
import { pasteUrlDecodePlugin } from "./pasteUrlDecodePlugin";
import { draftConfirmPlugin } from "./draftConfirmPlugin";

export interface NoteEditorProps {
  // The card's PocketBase record id, doubling as the Yjs room name
  // (see docs/yjs-design.md). Undefined means "draft": no "cards"
  // record exists yet, so editing starts on a local-only Y.Doc with no
  // WebsocketProvider (see connectProvider below). Read once at setup,
  // not tracked -- draft mode never changes cardId after the fact, it
  // resolves the real id via onDraftConfirmed instead.
  cardId: () => string | undefined;
  // Only meaningful in draft mode. Called exactly once, the moment the
  // document's first non-empty content is confirmed (see
  // draftConfirmPlugin.ts); must create the backing "cards" record and
  // resolve with its id, which is then used to connect the
  // WebsocketProvider. An abandoned draft that never confirms any
  // content never calls this, so it never creates an empty card.
  onDraftConfirmed?: () => Promise<string>;
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

  // The WebsocketProvider is what actually syncs `ydoc` over the
  // network -- ySyncPlugin (wired up below) works against `fragment`
  // regardless of whether a provider is connected, so draft mode can
  // edit locally from the very first keystroke and only gains network
  // sync once a real record id exists (see connectProvider/
  // handleDraftConfirmed below).
  let provider: WebsocketProvider | undefined;

  // Builds the connection URL as `${base}/${room}`. The "/yjs" prefix
  // is proxied to the Go backend's "/yjs/{room}" route (see
  // vite.config.ts, which also rewrites the Origin header so the
  // backend's same-origin websocket check passes).
  const connectProvider = (cardId: string) => {
    const wsProtocol = location.protocol === "https:" ? "wss:" : "ws:";
    provider = new WebsocketProvider(
      `${wsProtocol}//${location.host}/yjs`,
      cardId,
      ydoc,
    );
  };

  const initialCardId = props.cardId();
  if (initialCardId) {
    connectProvider(initialCardId);
  }

  // Fires once draftConfirmPlugin detects the document's first
  // non-empty content: creates the backing record via
  // onDraftConfirmed, then connects the provider using its id. Errors
  // are swallowed here (draft mode has no sync-status UI yet); the
  // editor just stays local-only if this fails, so the user's typing
  // isn't lost even though it isn't synced.
  const handleDraftConfirmed = async () => {
    if (!props.onDraftConfirmed) return;
    try {
      const cardId = await props.onDraftConfirmed();
      connectProvider(cardId);
    } catch (err) {
      console.error("[note-editor] failed to create draft card:", err);
    }
  };

  // defineNoteExtension() (see basicExtension.ts) is our own copy of
  // prosekit's defineBasicExtension() with prosekit's built-in
  // auto-linking swapped out for defineUrlLinkRule(), which only
  // recognizes explicit http(s):// URLs (see urlLinkRule.ts).
  const extension = union(defineNoteExtension(), defineUrlLinkRule());
  const editor = createEditor({ extension });

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
          blockIdPlugin(),
          headingPlaceholderPlugin(),
          linkClickPlugin(),
          pasteUrlDecodePlugin(),
          // Only needed in draft mode -- an already-confirmed card has
          // nothing left to detect.
          ...(initialCardId ? [] : [draftConfirmPlugin(handleDraftConfirmed)]),
          ...state.plugins,
        ],
      }),
    );

    // Autofocus straight into the editor -- there's no separate title
    // field to focus instead anymore.
    editor.view.focus();

    onCleanup(() => {
      provider?.destroy();
      ydoc.destroy();
      if (typeof unmount === "function") unmount();
    });
  };

  // 
  return (
    <>
    {/* *Horizontal padding is minimal on narrow screens (phones) since width is scarce there, but vertical padding stays generous regardless of screen size. */}
    <div class="min-w-0 flex-1 px-2 py-10 sm:px-10 bg-field shadow-md">
      <div
        ref={mountEditor}
        class="ProseMirror flex-1 overflow-y-auto text-text outline-none"
      />
    </div>
    </>
  );
}

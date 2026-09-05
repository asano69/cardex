import { createEffect, createSignal, onCleanup, Show } from "solid-js";
import "prosekit/basic/style.css";
import "prosekit/basic/typography.css";
import { defineBasicExtension } from "prosekit/basic";
import { createEditor } from "prosekit/core";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { ySyncPlugin } from "y-prosemirror";

// How long to wait after the last title edit before autosaving. Losing
// focus on the title field (see onFocusOut below) flushes immediately
// instead of waiting for this timeout.
const AUTOSAVE_DEBOUNCE_MS = 1000;

export interface NoteEditorProps {
  // Reactive accessor for the title, sourced from the shared cards
  // store (see routes/issues/CardForm.tsx) -- the same store
  // IssueDetail's card grid reads from. Any change here, whether our
  // own save round-tripping through the store or another user's edit
  // arriving over realtime, replaces the title field. No conflict
  // resolution for now: a remote change wins even mid-edit.
  title: () => string | undefined;
  // The card's PocketBase record id, doubling as the Yjs room name
  // (see docs/yjs-design.md). undefined until the card has been
  // created -- the body editor only mounts once this becomes
  // available, since a Yjs room needs a name to connect to.
  cardId: () => string | undefined;
  onSaveTitle: (title: string) => Promise<void>;
}

// Title input + Yjs-synced ProseKit rich-text body. Unlike the title,
// the body is not persisted to PocketBase at all right now: it only
// lives in the server's in-memory Yjs room (see
// internal/serve/handler.go) and is lost once every peer disconnects
// or the server restarts. This is a deliberate PoC simplification
// (see docs/yjs-design.md) -- only the title is still autosaved,
// through onSaveTitle.
export default function NoteEditor(props: NoteEditorProps) {
  // eslint-disable-next-line solid/reactivity
  const [title, setTitle] = createSignal(props.title() ?? "");
  // The last title known to be saved -- the initial fetch, a remote
  // update, or our own successful save. TitleAutoSave compares against
  // this (instead of a mount-time snapshot) to decide whether there's
  // anything left to save.
  // eslint-disable-next-line solid/reactivity
  const [savedTitle, setSavedTitle] = createSignal(props.title() ?? "");

  // Keeps the title field in sync with the shared store: whenever
  // props.title() changes -- another user's edit, or our own save
  // echoed back through the store -- it becomes the new title.
  createEffect(() => {
    const remote = props.title();
    if (remote === undefined) return;
    setTitle(remote);
    setSavedTitle(remote);
  });

  // Set by TitleAutoSave once it mounts, so a blur on the title field
  // can flush the same debounced save it schedules on every edit.
  let flush: (() => void) | undefined;

  return (
    // focusout bubbles (unlike blur), so losing focus on the title
    // field flushes any pending autosave immediately. This is the
    // whole editor's root -- callers own any surrounding layout (e.g.
    // a delete button placed next to it), so this only sizes itself
    // as a flex-1 item within whatever row/column the caller uses.
    <div
      class="min-w-0 flex-1 p-10 bg-field shadow-md"
      onFocusOut={() => flush?.()}
    >
      <input
        type="text"
        placeholder="Title"
        value={title()}
        onInput={(e) => setTitle(e.currentTarget.value)}
        required
        autofocus
        class="w-full bg-transparent pb-5 text-2xl outline-none"
      />
      {/* The body editor needs a room name to connect to, so it only
          mounts once cardId is available (existing card, or a
          brand-new one right after its first title save). */}
      <Show
        when={props.cardId()}
        fallback={
          <p class="text-sm text-border">Enter a title to start writing.</p>
        }
      >
        {(id) => <YjsBody roomId={id()} />}
      </Show>

      <TitleAutoSave
        title={title}
        savedTitle={savedTitle}
        onSave={props.onSaveTitle}
        onSaved={setSavedTitle}
        registerFlush={(fn) => (flush = fn)}
      />
    </div>
  );
}

interface TitleAutoSaveProps {
  title: () => string;
  // The last known-saved title, owned by NoteEditor so both this
  // component and the remote-sync effect above can update it (see
  // NoteEditor's savedTitle signal).
  savedTitle: () => string;
  onSave: (title: string) => Promise<void>;
  onSaved: (title: string) => void;
  registerFlush: (flush: () => void) => void;
}

// Watches the title (passed down as an accessor) and saves it whenever
// it changes: debounced while the person keeps typing (see
// AUTOSAVE_DEBOUNCE_MS), or immediately once NoteEditor's onFocusOut
// calls the flush function registered below. A save is skipped
// entirely while the title is empty or unchanged. Renders nothing.
function TitleAutoSave(props: TitleAutoSaveProps) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let saving = false;
  // Whether another save is needed once the in-flight one finishes, so
  // edits made while saving aren't dropped.
  let pending = false;

  const save = async () => {
    if (timer) {
      clearTimeout(timer);
      timer = undefined;
    }
    const title = props.title().trim();
    if (!title || title === props.savedTitle()) return;

    if (saving) {
      pending = true;
      return;
    }
    saving = true;
    try {
      await props.onSave(title);
      props.onSaved(title);
    } catch (err) {
      console.error("[noteEditor] title autosave failed:", err);
    } finally {
      saving = false;
      if (pending) {
        pending = false;
        save();
      }
    }
  };

  createEffect(() => {
    props.title();
    if (timer) clearTimeout(timer);
    timer = setTimeout(save, AUTOSAVE_DEBOUNCE_MS);
  });

  onCleanup(() => {
    if (timer) clearTimeout(timer);
  });

  props.registerFlush(save);

  return null;
}

interface YjsBodyProps {
  roomId: string;
}

// Mounts a ProseKit editor synced in real time via Yjs (see
// docs/yjs-design.md): the room name is the card's own id, so every
// tab editing the same card shares one document. The room's content is
// kept in sync with the matching card's "ydoc" field on the Go side
// (see internal/serve/ydoc.go): that field seeds a fresh room the
// moment the first peer connects, so there is nothing to load here.
function YjsBody(props: YjsBodyProps) {
  const ydoc = new Y.Doc();
  const fragment = ydoc.getXmlFragment("prosemirror");

  // WebsocketProvider builds the connection URL as `${base}/${room}`.
  // The "/yjs" prefix is proxied to the Go backend's "/yjs/{room}"
  // route (see vite.config.ts, which also rewrites the Origin header
  // so the backend's same-origin websocket check passes).
  const wsProtocol = location.protocol === "https:" ? "wss:" : "ws:";
  const provider = new WebsocketProvider(
    `${wsProtocol}//${location.host}/yjs`,
    props.roomId,
    ydoc,
  );

  const editor = createEditor({ extension: defineBasicExtension() });

  // Solid doesn't auto-unmount ref callbacks the way React's new
  // ref-cleanup convention does, so the returned unmount function is
  // wired to onCleanup explicitly here.
  const mountEditor = (el: HTMLDivElement) => {
    const unmount = editor.mount(el);

    // Splice the yjs sync plugin into the state prosekit already
    // built. The doc always starts empty here: nothing is loaded from
    // PocketBase's "content" field, only whatever the room already
    // holds (nothing, for a brand-new card).
    const state = editor.view.state;
    editor.view.updateState(
      state.reconfigure({
        plugins: [ySyncPlugin(fragment), ...state.plugins],
      }),
    );

    onCleanup(() => {
      provider.destroy();
      ydoc.destroy();
      if (typeof unmount === "function") unmount();
    });
  };

  return (
    <div
      ref={mountEditor}
      class="ProseMirror flex-1 overflow-y-auto text-text outline-none"
    />
  );
}

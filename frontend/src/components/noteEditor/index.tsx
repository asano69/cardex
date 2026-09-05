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
  initialTitle?: string;
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
  // Read once on mount: CardForm remounts NoteEditor (via <Show>)
  // whenever the initial title actually changes, so nothing here needs
  // to react to prop updates afterwards.
  // eslint-disable-next-line solid/reactivity
  const initialTitle = props.initialTitle ?? "";
  const [title, setTitle] = createSignal(initialTitle);

  // Set by TitleAutoSave once it mounts, so a blur on the title field
  // can flush the same debounced save it schedules on every edit.
  let flush: (() => void) | undefined;

  return (
    // focusout bubbles (unlike blur), so losing focus on the title
    // field flushes any pending autosave immediately.
    <div
      class="m-6 flex min-h-0 w-full flex-1 flex-col gap-4"
      onFocusOut={() => flush?.()}
    >
      <div class="p-10 bg-field shadow-md">
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
            <p class="text-sm text-border">
              Enter a title to start writing.
            </p>
          }
        >
          {(id) => <YjsBody roomId={id()} />}
        </Show>
      </div>

      <TitleAutoSave
        title={title}
        onSave={props.onSaveTitle}
        registerFlush={(fn) => (flush = fn)}
      />
    </div>
  );
}

interface TitleAutoSaveProps {
  title: () => string;
  onSave: (title: string) => Promise<void>;
  registerFlush: (flush: () => void) => void;
}

// Watches the title (passed down as an accessor) and saves it whenever
// it changes: debounced while the person keeps typing (see
// AUTOSAVE_DEBOUNCE_MS), or immediately once NoteEditor's onFocusOut
// calls the flush function registered below. A save is skipped
// entirely while the title is empty or unchanged. Renders nothing.
function TitleAutoSave(props: TitleAutoSaveProps) {
  // eslint-disable-next-line solid/reactivity
  let baselineTitle = props.title();
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
    if (!title || title === baselineTitle) return;

    if (saving) {
      pending = true;
      return;
    }
    saving = true;
    try {
      await props.onSave(title);
      baselineTitle = title;
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
// tab editing the same card shares one document. PoC only -- no
// persistence, no auth: the doc lives purely in memory on the server
// and is lost on restart or once every peer disconnects.
function YjsBody(props: YjsBodyProps) {
  const ydoc = new Y.Doc();
  const fragment = ydoc.getXmlFragment("prosemirror");

  // WebsocketProvider builds the connection URL as `${base}/${room}`.
  // The "/yjs" prefix is proxied to the Go backend's "/yjs/{room}"
  // route (see vite.config.ts).
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

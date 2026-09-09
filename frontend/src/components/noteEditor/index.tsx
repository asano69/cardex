import { createSignal, onCleanup, Show } from "solid-js";
// The editor's structural CSS (ProseMirror core, gap cursor, table,
// list) now lives in styles/components.css, loaded globally via
// styles/index.css -- no per-component stylesheet import needed here
// anymore (this used to be prosekit/basic/style.css).
import { EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { noteSchema } from "./schema";
import { urlLinkPlugin } from "./urlLinkRule";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { ySyncPlugin } from "y-prosemirror";
import { keymap } from "prosemirror-keymap";
import { baseKeymap, chainCommands } from "prosemirror-commands";
import { history, undo, redo } from "prosemirror-history";
import { gapCursor } from "prosemirror-gapcursor";
import { inputRules } from "prosemirror-inputrules";
import { tableEditing } from "prosemirror-tables";
import {
  createWrapInListCommand,
  createListPlugins,
  listInputRules,
  listKeymap,
} from "prosemirror-flat-list";
import { forceFirstHeadingPlugin } from "./forceFirstHeadingPlugin";
import { linkClickPlugin } from "./linkClickPlugin";
import { blockIdPlugin } from "./blockIdPlugin";
import { pasteUrlDecodePlugin } from "./pasteUrlDecodePlugin";
import { imageMarkdownPlugin } from "./imageMarkdownPlugin";
import { titleCandidatePlugin } from "./titleCandidatePlugin";
import { createCard, updateCardTitle } from "../../lib/cardApi";
import type { TitleCandidate } from "../../lib/titleCandidate";
import { mergeCards } from "../../lib/cardsStore";
import type { CardRecord } from "../../routes/cards/CardForm";

export interface NoteEditorProps {
  // The card's PocketBase record id, doubling as the Yjs room name
  // (see docs/yjs-design.md). Undefined means "draft": no "cards"
  // record exists yet, so editing starts on a local-only Y.Doc with no
  // WebsocketProvider (see connectProvider below). Read once at setup,
  // not tracked -- draft mode never changes cardId after the fact, it
  // resolves the real id via handleSlugCandidate below instead.
  cardId: () => string | undefined;
  // The card's parent pot id, needed in draft mode to create the
  // backing record (see handleSlugCandidate below). Ignored once
  // cardId already resolves to a real record.
  potId?: () => string | undefined;
  // Pre-fills the document's first block (the header) with this text
  // when starting a brand-new draft -- e.g. opening /:pot/:cardSlug
  // with no matching card seeds this from the URL's slug instead of
  // showing "not found" (see CardForm.tsx). Ignored once cardId is
  // already set, since only a fresh draft's empty doc gets seeded.
  initialTitle?: string;
  // Called exactly once, the moment a draft's backing "cards" record
  // is created, so the caller (CardForm) can start tracking the real
  // record id (e.g. for its own URL sync).
  onCardCreated?: (cardId: string) => void;
  // Called with the merge-alert target (see findMergeTarget in
  // internal/serve/slug.go) after every slug-resolving API call
  // (create or update), so the caller (CardForm) can display it. null
  // clears any previously shown alert.
  onMergeTarget?: (target: string | null) => void;
}

// A single Yjs-synced ProseKit editor covering both title and body:
// the document's first block is the title (styled larger via
// ".ProseMirror > :first-child" in styles/components.css), everything
// below it is the body. Neither is persisted to PocketBase directly --
// both only live in the server's in-memory Yjs room (see
// internal/serve/handler.go). The "title" and "description" fields shown
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
  // sendCandidate below).
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

  // Read once at setup (like the old initialCardId), but mutable: it
  // flips from undefined to a real id the moment a draft's backing
  // record is created (see sendCandidate below), which is also what
  // switches later slug candidates from createCard to updateCardSlug.
  let cardId = props.cardId();
  if (cardId) {
    connectProvider(cardId);
  }

  // True only when this editor opens an existing card right from the
  // start (cardId already set above), not when a brand-new draft's
  // backing record is created moments later via sendCandidate. An
  // existing card whose title was never set still has an empty
  // heading in its Yjs document -- cards.go's "Untitled" fallback only
  // sets the "cards" record's title field, not the document itself.
  // This flag is what lets mountEditor below fill that heading with
  // real "Untitled" text once the card is opened, without ever doing
  // so while a card is still being actively drafted.
  const isOpeningExistingCard = !!cardId;

  const [slugError, setSlugError] = createSignal(false);

  // NOTE(prosekit removal): ProseKit's defineVirtualSelection() and
  // defineModClickPrevention() extensions have no direct raw-
  // ProseMirror equivalent and are not reinstated here. Neither is
  // exercised by this app's own behavior -- link clicks are already
  // handled explicitly by linkClickPlugin.ts, and no IME-composition
  // issue motivating virtual selection has ever surfaced -- so they're
  // dropped rather than reimplemented, in line with keeping the editor
  // setup as simple as possible. Revisit only if a concrete bug traces
  // back to one of them.

  // In-flight control for slug candidates coming from
  // slugCandidatePlugin: only one request is ever outstanding at a
  // time. A candidate that arrives while one is pending replaces
  // `pendingCandidate` instead of firing its own request; once the
  // in-flight request settles, the latest pending candidate (if any)
  // is sent immediately, skipping the debounce window the plugin
  // already waited out. `sequence` lets a response tell whether a
  // newer request has since started, so a slow, stale response never
  // overwrites a newer one's result.
  let sequence = 0;
  let inFlight = false;
  let pendingCandidate: TitleCandidate | null = null;
  let lastResolvedCandidate: TitleCandidate | null = null;

  const sendCandidate = async (candidate: TitleCandidate) => {
    inFlight = true;
    const mySequence = ++sequence;
    try {
      const result = cardId
        ? await updateCardTitle(cardId, candidate)
        : await createCard(props.potId?.() ?? "", candidate);

      if (mySequence !== sequence) return; // superseded by a newer request

      setSlugError(false);
      lastResolvedCandidate = candidate;
      mergeCards([result.card]);
      props.onMergeTarget?.(result.mergeTarget);
      if (!cardId) {
        cardId = result.card.id;
        connectProvider(cardId);
        props.onCardCreated?.(cardId);
      }
    } catch (err) {
      console.error("[note-editor] failed to resolve card slug:", err);
      setSlugError(true);
    } finally {
      inFlight = false;
      if (pendingCandidate !== null) {
        const next = pendingCandidate;
        pendingCandidate = null;
        sendCandidate(next);
      }
    }
  };

  // Called by titleCandidatePlugin whenever the header (or the body's
  // first line) is confirmed. Shared by draft creation and
  // existing-card slug edits -- which one happens is decided purely by
  // whether `cardId` is already set (see sendCandidate above).
  const handleSlugCandidate = (candidate: TitleCandidate) => {
    if (candidate === lastResolvedCandidate) return;
    // An empty candidate is only meaningful for a brand-new draft --
    // confirming with no header falls back to "Untitled" server-side
    // (see cards.go's createCardHandler). An existing card's slug/
    // title should never be reset just because its header was cleared.
    if (!candidate && cardId) return;
    if (inFlight) {
      pendingCandidate = candidate;
      return;
    }
    sendCandidate(candidate);
  };

  // Solid doesn't auto-unmount ref callbacks the way React's new
  // ref-cleanup convention does, so `view.destroy()` is wired to
  // onCleanup explicitly below.
  const mountEditor = (el: HTMLDivElement) => {
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

    // The doc always starts empty here: nothing is loaded from
    // PocketBase, only whatever the room already holds (nothing, for
    // a brand-new card) -- ySyncPlugin(fragment) below is what
    // actually populates it. Plugin order matters in a few places,
    // called out inline.
    const state = EditorState.create({
      schema: noteSchema,
      plugins: [
        ySyncPlugin(fragment),
        listTabKeymap,
        forceFirstHeadingPlugin(),
        blockIdPlugin(),
        linkClickPlugin(),
        pasteUrlDecodePlugin(),
        // Must run before urlLinkPlugin: consuming the bracket/
        // markdown text into an image node first means there's
        // nothing left for the link plugin to mark as a link.
        imageMarkdownPlugin(),
        urlLinkPlugin(),
        titleCandidatePlugin(handleSlugCandidate),
        // Everything below is generic editor plumbing with no
        // app-specific behavior, equivalent to what ProseKit's
        // defineBaseKeymap/defineBaseCommands/defineHistory/
        // defineGapCursor and prosemirror-flat-list/prosemirror-
        // tables' own extensions used to wire up automatically.
        ...createListPlugins({ schema: noteSchema }),
        inputRules({ rules: listInputRules }),
        keymap(baseKeymap),
        history(),
        keymap({ "Mod-z": undo, "Shift-Mod-z": redo, "Mod-y": redo }),
        gapCursor(),
        tableEditing(),
      ],
    });

    let view: EditorView;
    view = new EditorView(el, {
      state,
      dispatchTransaction(tr) {
        view.updateState(view.state.apply(tr));
      },
    });

    // Seed the document's first block with initialTitle for a
    // brand-new draft opened from a URL slug that matched no existing
    // card (see CardForm.tsx). This is a plain text insertion, so it
    // flows through titleCandidatePlugin exactly like typing -- the
    // header still doesn't resolve into a real "cards" record (no
    // websocket connection yet) until it's confirmed via Enter or the
    // debounce window, same as any other draft. No focus is set here;
    // that's left to the autofocus block below.
    if (!cardId && props.initialTitle) {
      view.dispatch(view.state.tr.insertText(props.initialTitle, 1));
    }

    // Autofocus into the editor only for a brand-new draft card, so
    // typing can start immediately. Opening an existing card leaves
    // focus untouched. Deferred to the next task: right after mount
    // the editor's DOM element may not be attached to the document
    // yet, which makes a synchronous focus() call silently do nothing.
    if (!cardId) {
      setTimeout(() => view.focus(), 0);
    }

    // For an existing card opened with an empty title, replace the
    // empty heading with real "Untitled" text once the initial Yjs
    // sync completes -- see isOpeningExistingCard above for why this
    // never runs for a card still being drafted. Only fires once: the
    // listener removes itself the first time it sees a completed sync.
    let fillUntitledIfEmpty: ((isSynced: boolean) => void) | undefined;
    if (isOpeningExistingCard && provider) {
      fillUntitledIfEmpty = (isSynced) => {
        if (!isSynced) return;
        provider?.off("sync", fillUntitledIfEmpty!);
        const heading = view.state.doc.firstChild;
        if (heading && heading.textContent.trim() === "") {
          view.dispatch(view.state.tr.insertText("Untitled", 1));
        }
      };
      provider.on("sync", fillUntitledIfEmpty);
    }

    onCleanup(() => {
      if (fillUntitledIfEmpty) provider?.off("sync", fillUntitledIfEmpty);
      provider?.destroy();
      ydoc.destroy();
      view.destroy();
    });
  };

  // Horizontal padding is minimal on narrow screens (phones) since
  // width is scarce there, but vertical padding stays generous
  // regardless of screen size.
  return (
    <>
      <div class="min-w-0 flex-1 px-2 py-10 sm:px-10 bg-field shadow-md">
        <Show when={slugError()}>
          <p class="mb-4 text-sm text-[#dc3545]">
            Failed to save this card. Your text is still here, but it isn't
            synced -- try editing the header again once you're back online.
          </p>
        </Show>
        <div
          ref={mountEditor}
          class="ProseMirror flex-1 overflow-y-auto text-text outline-none"
        />
      </div>
    </>
  );
}

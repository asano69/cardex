import { createSignal, onCleanup, Show } from "solid-js";
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
import { linkClickPlugin } from "./linkClickPlugin";
import { blockIdPlugin } from "./blockIdPlugin";
import { pasteUrlDecodePlugin } from "./pasteUrlDecodePlugin";
import { slugCandidatePlugin } from "./slugCandidatePlugin";
import { createCard, updateCardSlug } from "../../lib/cardApi";
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
        ? await updateCardSlug(cardId, candidate)
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

  // Called by slugCandidatePlugin whenever the header (or the body's
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
          linkClickPlugin(),
          pasteUrlDecodePlugin(),
          slugCandidatePlugin(handleSlugCandidate),
          ...state.plugins,
        ],
      }),
    );

    // Autofocus into the editor only for a brand-new draft card, so
    // typing can start immediately. Opening an existing card leaves
    // focus untouched. Deferred to the next task: right after mount
    // the editor's DOM element may not be attached to the document
    // yet, which makes a synchronous focus() call silently do nothing.
    if (!cardId) {
      setTimeout(() => editor.view.focus(), 0);
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
        const heading = editor.view.state.doc.firstChild;
        if (heading && heading.textContent.trim() === "") {
          editor.view.dispatch(editor.view.state.tr.insertText("Untitled", 1));
        }
      };
      provider.on("sync", fillUntitledIfEmpty);
    }

    onCleanup(() => {
      if (fillUntitledIfEmpty) provider?.off("sync", fillUntitledIfEmpty);
      provider?.destroy();
      ydoc.destroy();
      if (typeof unmount === "function") unmount();
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

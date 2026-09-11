import { onCleanup, Show, createSignal } from "solid-js";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, drawSelection } from "@codemirror/view";
import { defaultKeymap, indentMore, indentLess } from "@codemirror/commands";
import { yCollab, yUndoManagerKeymap } from "y-codemirror.next";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { IndexeddbPersistence } from "y-indexeddb";
import {
  titleCandidateExtension,
  syntheticAnnotation,
} from "./titleCandidatePlugin";
import { titleLineHighlight } from "./titleLineHighlight";
import { editorTheme } from "./editorTheme";
// Temporarily disabled while debugging hanging-indent (wrapped line)
// behavior in isolation -- see docs/code-mirror-migration.md.
// import { bulletLineDecoration, bulletAtomicRanges } from "./bulletLineDecoration";
import {
  syntaxHighlighting,
  defaultHighlightStyle,
  indentUnit,
} from "@codemirror/language";
import { cardpotSyntax } from "./cardpotSyntax";
import { createCard, updateCardTitle } from "../../lib/cardApi";
import type { TitleCandidate } from "../../lib/titleCandidate";
import { cardsById, mergeCards } from "../../lib/cardsStore";
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
  // Pre-fills the document's first line (the header) with this text
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

// A single Yjs-synced CodeMirror editor covering both title and body,
// as plain text: line 1 is the title, everything below it is the
// body. Neither is persisted to PocketBase directly -- both only live
// in the server's in-memory Yjs room (see internal/serve/handler.go).
// The "title" and "description" fields shown elsewhere (e.g.
// CardItem's grid) are derived server-side from this same room's
// content (see internal/serve/ydoc.go), not saved from here.
//
// This is a minimal skeleton: markdown-style decorations (bold/
// italic reveal, bracket links, image syntax, ...) that the old
// ProseMirror editor had are intentionally not reimplemented yet --
// see this project's CLAUDE.md for the migration's current phase.
export default function NoteEditor(props: NoteEditorProps) {
  const ydoc = new Y.Doc();
  const ytext = ydoc.getText("content");

  // The WebsocketProvider is what actually syncs `ydoc` over the
  // network -- yCollab (wired up below) works against `ytext`
  // regardless of whether a provider is connected, so draft mode can
  // edit locally from the very first keystroke and only gains network
  // sync once a real record id exists (see connectProvider/
  // sendCandidate below).
  let provider: WebsocketProvider | undefined;
  // Caches `ydoc`'s state in IndexedDB, keyed by the same cardId as
  // the websocket room, so edits made while offline survive a reload
  // instead of being lost along with the in-memory-only Y.Doc.
  // WebsocketProvider already re-syncs the diff automatically once
  // the connection comes back, so no extra reconciliation logic is
  // needed here.
  let idbProvider: IndexeddbPersistence | undefined;

  // Builds the connection URL as `${base}/${room}`. The "/yjs" prefix
  // is proxied to the Go backend's "/yjs/{room}" route (see
  // vite.config.ts, which also rewrites the Origin header so the
  // backend's same-origin websocket check passes).
  const connectProvider = (cardId: string) => {
    idbProvider = new IndexeddbPersistence(cardId, ydoc);
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
  // switches later title candidates from createCard to updateCardTitle.
  let cardId = props.cardId();
  if (cardId) {
    connectProvider(cardId);
  }

  const [slugError, setSlugError] = createSignal(false);

  // In-flight control for title candidates coming from
  // titleCandidatePlugin: only one request is ever outstanding at a
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
      console.error("[note-editor] failed to resolve card title:", err);
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

  // Called by titleCandidatePlugin whenever the header (line 1) is
  // confirmed. Shared by draft creation and existing-card title edits
  // -- which one happens is decided purely by whether `cardId` is
  // already set (see sendCandidate above).
  const handleSlugCandidate = (candidate: TitleCandidate) => {
    if (candidate === lastResolvedCandidate) return;
    // An empty candidate is only meaningful for a brand-new draft --
    // confirming with no header falls back to "Untitled" server-side
    // (see cards.go's createCardHandler). An existing card's title
    // should never be reset just because its header was cleared.
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
    // The doc always starts from `ytext`'s current content here --
    // for a brand-new card that's empty, for an existing one it's
    // whatever the room already holds. yCollab keeps this view and
    // `ytext` in sync afterward. Awareness (remote cursors) isn't
    // wired up yet -- passing null keeps this skeleton minimal; see
    // this file's own top comment.
    const state = EditorState.create({
      doc: ytext.toString(),
      extensions: [
        EditorView.lineWrapping,
        // Draws the cursor/selection itself (via coordsAtPos) instead
        // of relying on the browser's native contenteditable caret.
        // Needed because IndentMarkWidget replaces a tab character
        // with a widget (see bulletLineDecoration.ts): right after
        // Tab inserts a new widget, the native caret can render at a
        // stale layout position until the next reflow (e.g. another
        // keystroke or Shift-Tab) forces the browser to recompute it.
        // CodeMirror's own caret is computed fresh from the current
        // position mapping every time, so it never shows that lag.
        drawSelection(),
        yCollab(ytext, null),
        titleCandidateExtension(handleSlugCandidate),
        titleLineHighlight,
        editorTheme,
        // Shows a bullet marker after any line's leading tabs,
        // purely visual -- see bulletLineDecoration.ts.
        // ////////////////////////
        //bulletLineDecoration, 
        // Prevents the cursor from ever landing inside a bullet
        // widget's own boundary -- see bulletLineDecoration.ts.
        // /////////////////////////
        //bulletAtomicRanges,
        // Cardpot's own inline syntax (wiki links, brackets, tags --
        // see cardpotSyntax.ts). Needs syntaxHighlighting() alongside
        // it: the parser only tags nodes, this is what actually turns
        // those tags into colored text.
        // Shows a bullet marker after any line's leading tabs,
        // purely visual -- see bulletLineDecoration.ts.
        // Temporarily disabled: see the import comment above.
        // bulletLineDecoration,
        // Prevents the cursor from ever landing inside a bullet
        // widget's own boundary -- see bulletLineDecoration.ts.
        // bulletAtomicRanges,
        cardpotSyntax(),
        syntaxHighlighting(defaultHighlightStyle),
        // A single real tab character per indent level, not spaces --
        // indentMore/indentLess (bound below) both insert/remove
        // whatever this unit is. Matches bulletLineDecoration.ts's own
        // LEADING_TABS_RE, which only recognizes literal tabs.
        indentUnit.of("\t"),
        // Tab/Shift-Tab indent/outdent the current line(s) -- the
        // plain-text equivalent of the old prosemirror-flat-list
        // bullet indent/outdent (see prose-mirror.old/index.tsx's
        // listTabKeymap). Bound ahead of defaultKeymap in the array
        // below so it wins over defaultKeymap's own plain "insert a
        // tab character" Tab binding.
        keymap.of([
          { key: "Tab", run: indentMore },
          { key: "Shift-Tab", run: indentLess },
        ]),
        // yCollab supplies its own undo/redo keymap, backed by Yjs's
        // UndoManager -- CM6's own history() extension is
        // deliberately not added, to avoid two undo stacks fighting
        // each other.
        keymap.of([...yUndoManagerKeymap, ...defaultKeymap]),
      ],
    });

    const view = new EditorView({ state, parent: el });

    // Seed the document's first line with initialTitle for a
    // brand-new draft opened from a URL slug that matched no existing
    // card (see CardForm.tsx). Tagged with syntheticAnnotation so
    // titleCandidatePlugin doesn't treat this as a real user edit --
    // otherwise this programmatic seed alone would start (and, after
    // the debounce window, fire) the title-confirmation flow with no
    // actual user action, silently turning every "URL slug that
    // doesn't exist yet" visit into a real card. The header still
    // only resolves into a real "cards" record once the user actually
    // types, pastes, or presses Enter (see titleCandidatePlugin). No
    // focus is set here; that's left to the autofocus block below.
    if (!cardId && props.initialTitle) {
      view.dispatch({
        changes: { from: 0, insert: props.initialTitle },
        annotations: syntheticAnnotation.of(true),
      });
    }

    // Autofocus into the editor only for a brand-new draft card, so
    // typing can start immediately. Opening an existing card leaves
    // focus untouched. Deferred to the next task: right after mount
    // the editor's DOM element may not be attached to the document
    // yet, which makes a synchronous focus() call silently do nothing.
    if (!cardId) {
      setTimeout(() => view.focus(), 0);
    }

    // Only fill the placeholder for a card whose server-confirmed
    // title is already "Untitled" (see cards.go's defaultTitle
    // fallback for an empty candidate). Gating on this synchronous,
    // already-known value -- instead of only checking whether the Yjs
    // doc *looks* empty once "sync" fires -- avoids a race where the
    // doc actually has content that simply hasn't synced to this
    // client yet: that content used to get misread as "still empty"
    // and clobbered with literal "Untitled" text. `provider` is only
    // set here for a card that was already an existing record when
    // this editor mounted (see connectProvider above), so this also
    // never runs for a card still being actively drafted. Only fires
    // once: the listener removes itself the first time it sees a
    // completed sync.
    let fillUntitledIfEmpty: (() => void) | undefined;
    if (provider && cardId && cardsById[cardId]?.title === "Untitled") {
      fillUntitledIfEmpty = () => {
        provider?.off("sync", fillUntitledIfEmpty!);
        if (view.state.doc.line(1).text.trim() === "") {
          // Synthetic for the same reason as the initialTitle seed
          // above: this is a programmatic fill, not a user edit.
          view.dispatch({
            changes: { from: 0, insert: "Untitled" },
            annotations: syntheticAnnotation.of(true),
          });
        }
      };
      provider.on("sync", fillUntitledIfEmpty);
    }

    onCleanup(() => {
      if (fillUntitledIfEmpty) provider?.off("sync", fillUntitledIfEmpty);
      provider?.destroy();
      idbProvider?.destroy();
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
        <div ref={mountEditor} class="text-text outline-none" />
      </div>
    </>
  );
}

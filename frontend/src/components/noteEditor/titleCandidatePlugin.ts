import {
  Annotation,
  type EditorState,
  type Extension,
} from "@codemirror/state";
import type { PluginValue, ViewUpdate } from "@codemirror/view";
import { ViewPlugin } from "@codemirror/view";
import { ySyncAnnotation } from "y-codemirror.next";
import {
  type TitleCandidate,
  makeTitleCandidate,
} from "../../lib/titleCandidate";

// How long to wait, after the last edit to the header (line 1), before
// treating it as "confirmed" and firing the callback. Pressing Enter
// to leave the header fires immediately instead of waiting out this
// window (see headerJustCommitted below).
const DEBOUNCE_MS = 2000;

// Tags a transaction NoteEditor dispatches itself programmatically --
// seeding a brand-new draft's header, or filling a blank "Untitled"
// header -- so update() below excludes it from candidate detection,
// the same way a real user edit would be excluded from firing twice.
export const syntheticAnnotation = Annotation.define<boolean>();

// The header is always line 1. CodeMirror's line-based document model
// makes this a direct lookup, unlike ProseMirror's node-tree walk
// this replaced.
function extractCandidate(state: EditorState): TitleCandidate {
  return makeTitleCandidate(state.doc.line(1).text);
}

// True the moment an update grows the document from a single line to
// two or more -- i.e. the user just pressed Enter to leave the
// header. Used to fire immediately instead of waiting out the
// debounce window.
function headerJustCommitted(update: ViewUpdate): boolean {
  return update.startState.doc.lines <= 1 && update.state.doc.lines >= 2;
}

// Whether any transaction in `update` reflects an actual user edit --
// excludes this module's own synthetic transactions (see
// syntheticAnnotation above) and y-codemirror.next's remote-sync
// transactions (tagged with ySyncAnnotation whenever a change comes
// from Yjs itself: another peer's edit, or the initial doc <- ytext
// seed on mount).
function hasUserEdit(update: ViewUpdate): boolean {
  return update.transactions.some(
    (tr) =>
      tr.docChanged &&
      tr.annotation(syntheticAnnotation) === undefined &&
      tr.annotation(ySyncAnnotation) === undefined,
  );
}

// Fires `onConfirmed` with a title candidate string whenever the
// header (line 1) is "confirmed": either the user presses Enter to
// move past it, or DEBOUNCE_MS passes with no further edits to it,
// whichever comes first. Shared by both draft creation and
// existing-card title editing (see NoteEditor's index.tsx) -- this
// plugin has no notion of which mode it's running in, only "a new
// candidate string is ready".
class TitleCandidateTracker implements PluginValue {
  private debounceTimer: ReturnType<typeof setTimeout> | undefined;
  private lastFired: TitleCandidate | null = null;

  constructor(
    private readonly onConfirmed: (candidate: TitleCandidate) => void,
  ) {}

  update(update: ViewUpdate) {
    if (!hasUserEdit(update)) return;

    const candidate = extractCandidate(update.state);
    clearTimeout(this.debounceTimer);

    if (headerJustCommitted(update)) {
      this.fire(candidate);
    } else {
      this.debounceTimer = setTimeout(() => this.fire(candidate), DEBOUNCE_MS);
    }
  }

  // Cancels any pending debounce timer when the EditorView is
  // destroyed. Without this, leaving a brand-new draft within the
  // debounce window still let the pending fire() call run afterwards,
  // resolving a card the user never confirmed -- exactly what draft
  // mode is meant to prevent.
  destroy() {
    clearTimeout(this.debounceTimer);
  }

  private fire(candidate: TitleCandidate) {
    // Empty candidates are allowed through too -- an empty header
    // confirmed via Enter or the debounce below resolves to
    // "Untitled" server-side (see cards.go's createCardHandler). Only
    // a repeat of the same value is skipped.
    if (candidate === this.lastFired) return;
    this.lastFired = candidate;
    this.onConfirmed(candidate);
  }
}

export function titleCandidateExtension(
  onConfirmed: (candidate: TitleCandidate) => void,
): Extension {
  return ViewPlugin.define(() => new TitleCandidateTracker(onConfirmed));
}

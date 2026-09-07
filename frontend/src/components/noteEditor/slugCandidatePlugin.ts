import { Plugin, type Transaction } from "prosemirror-state";
import type { Node as PMNode } from "prosemirror-model";

// How long to wait, after the last edit to the header (or the body's
// first line when the header is empty), before treating it as
// "confirmed" and firing the callback. Pressing Enter to leave the
// header fires immediately instead of waiting out this window (see
// headerJustCommitted below).
const DEBOUNCE_MS = 2000;

// Extracts the slug candidate text: the document's first block (always
// a level-1 heading, see forceFirstHeadingPlugin) if it has any text,
// otherwise the first paragraph's text. Mirrors the title/preview
// split in internal/serve/ydoc.go's buildTitleAndPreview, minus the
// XML parsing since this reads the live ProseMirror doc directly.
function extractCandidate(doc: PMNode): string {
  const heading = doc.firstChild;
  if (heading && heading.textContent.trim() !== "") {
    return heading.textContent.trim();
  }
  const second = doc.maybeChild(1);
  if (second && second.textContent.trim() !== "") {
    return second.textContent.trim();
  }
  return "";
}

// True the moment a transaction grows the document from a single block
// to two or more -- i.e. the user just pressed Enter to leave the
// header (or the body's first line, if that's the candidate source).
// Used to fire immediately instead of waiting out the debounce window.
function headerJustCommitted(
  transactions: readonly Transaction[],
  oldChildCount: number,
  newChildCount: number,
): boolean {
  return (
    transactions.some((tr) => tr.docChanged) &&
    oldChildCount <= 1 &&
    newChildCount >= 2
  );
}

// Fires `onConfirmed` with a slug candidate string whenever the header
// (or the body's first line, if the header is empty) is "confirmed":
// either the user presses Enter to move past it, or DEBOUNCE_MS passes
// with no further edits to it, whichever comes first. Shared by both
// draft creation and existing-card slug editing (see NoteEditor's
// index.tsx) -- this plugin has no notion of which mode it's running
// in, only "a new candidate string is ready".
export function slugCandidatePlugin(onConfirmed: (candidate: string) => void) {
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  let lastFired: string | null = null;

  const fire = (candidate: string) => {
    // Empty candidates are allowed through too -- an empty header
    // confirmed via Enter or the debounce below resolves to
    // "Untitled" server-side (see cards.go's createCardHandler). Only
    // a repeat of the same value is skipped.
    if (candidate === lastFired) return;
    lastFired = candidate;
    onConfirmed(candidate);
  };

  return new Plugin({
    appendTransaction(transactions, oldState, newState) {
      if (!transactions.some((tr) => tr.docChanged)) return null;

      const candidate = extractCandidate(newState.doc);
      clearTimeout(debounceTimer);

      if (
        headerJustCommitted(
          transactions,
          oldState.doc.childCount,
          newState.doc.childCount,
        )
      ) {
        fire(candidate);
      } else {
        debounceTimer = setTimeout(() => fire(candidate), DEBOUNCE_MS);
      }
      return null;
    },
  });
}

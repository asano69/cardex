import { Plugin, type Transaction } from "prosemirror-state";
import type { Node as PMNode } from "prosemirror-model";
import { ySyncPluginKey } from "y-prosemirror";
import {
  type TitleCandidate,
  makeTitleCandidate,
} from "../../lib/titleCandidate";
import { isSynthetic } from "./syntheticTransaction";

// How long to wait, after the last edit to the header (or the body's
// first line when the header is empty), before treating it as
// "confirmed" and firing the callback. Pressing Enter to leave the
// header fires immediately instead of waiting out this window (see
// headerJustCommitted below).
const DEBOUNCE_MS = 2000;

// Extracts the title candidate text: the first textblock (paragraph,
// heading, codeBlock, ...) anywhere in the document -- at any depth
// and any position -- whose trimmed text content is non-empty. What
// matters is "first line with actual text", not whether that line
// happens to be a heading or a paragraph, and not whether it's the
// document's 0th or 1st top-level child: a document whose first 19
// lines are blank still resolves its candidate from line 20. Uses
// ProseMirror's own `isTextblock` rather than a hardcoded tag list, so
// this stays in sync with the schema automatically. Mirrors the
// title/description split in internal/serve/ydoc.go's
// buildTitleAndPreview, minus the XML parsing since this reads the
// live ProseMirror doc directly.
function extractCandidate(doc: PMNode): TitleCandidate {
  let candidate = "";
  doc.descendants((node) => {
    if (candidate !== "") return false; // already found -- stop descending further
    if (node.isTextblock) {
      const text = node.textContent.trim();
      if (text !== "") {
        candidate = text;
        return false; // no need to descend into a textblock's own children
      }
    }
    return true; // keep looking through this node's children
  });
  return makeTitleCandidate(candidate);
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

// Fires `onConfirmed` with a title candidate string whenever the header
// (or the body's first line, if the header is empty) is "confirmed":
// either the user presses Enter to move past it, or DEBOUNCE_MS passes
// with no further edits to it, whichever comes first. Shared by both
// draft creation and existing-card title editing (see NoteEditor's
// index.tsx) -- this plugin has no notion of which mode it's running
// in, only "a new candidate string is ready".
export function titleCandidatePlugin(
  onConfirmed: (candidate: TitleCandidate) => void,
) {
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  let lastFired: TitleCandidate | null = null;

  const fire = (candidate: TitleCandidate) => {
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
      // Only a transaction that reflects an actual user edit should
      // ever start (or immediately fire) the confirmation debounce
      // below. Two other sources of docChanged transactions in this
      // same array must be excluded:
      //   - y-prosemirror's own sync transactions (tagged via
      //     ySyncPluginKey's isChangeOrigin), e.g. seeding a
      //     brand-new empty Y.Doc with the schema's minimum content.
      //   - "infra" plugins that self-heal the document on every
      //     change (forceFirstHeadingPlugin, blockIdPlugin,
      //     imageMarkdownPlugin, urlLinkPlugin -- see
      //     syntheticTransaction.ts). Without excluding these too,
      //     e.g. blockIdPlugin assigning a UUID to the very first
      //     paragraph ySyncPlugin just created looked exactly like
      //     "the user typed something", silently starting (and
      //     eventually firing) the debounce on a draft nobody had
      //     touched yet -- creating an "Untitled" card the moment a
      //     new draft was opened.
      const userTransactions = transactions.filter(
        (tr) =>
          tr.docChanged &&
          !tr.getMeta(ySyncPluginKey)?.isChangeOrigin &&
          // "appendedTransaction" is a meta ProseMirror itself sets
          // (see EditorState.applyTransaction) on every transaction
          // produced by a plugin's own appendTransaction hook --
          // forceFirstHeadingPlugin, blockIdPlugin,
          // imageMarkdownPlugin, urlLinkPlugin, and any future
          // appendTransaction-based plugin, with no extra code needed
          // on their end. Checking this built-in meta instead of a
          // hand-rolled marker means a new appendTransaction plugin
          // is automatically excluded here without anyone having to
          // remember to opt it in.
          !tr.getMeta("appendedTransaction") &&
          // isSynthetic covers the other kind of non-user tr: a
          // programmatic view.dispatch() call that is NOT going
          // through appendTransaction (e.g. NoteEditor seeding a
          // draft's initialTitle, or filling a blank "Untitled"
          // heading) -- see syntheticTransaction.ts.
          !isSynthetic(tr),
      );
      if (userTransactions.length === 0) return null;

      const candidate = extractCandidate(newState.doc);
      clearTimeout(debounceTimer);

      if (
        headerJustCommitted(
          userTransactions,
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

    // Cancels any pending debounce timer when the EditorView is
    // destroyed (see NoteEditor's onCleanup). Without this, leaving a
    // brand-new draft within the debounce window still let the
    // pending fire() callback run afterwards, resolving a card the
    // user never confirmed -- exactly what draft mode is meant to
    // prevent.
    view() {
      return {
        destroy() {
          clearTimeout(debounceTimer);
        },
      };
    },
  });
}

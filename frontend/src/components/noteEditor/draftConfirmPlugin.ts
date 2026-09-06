import { Plugin } from "prosemirror-state";

// Fires `onConfirmed` exactly once, the first time any block in the
// document holds non-whitespace text. Used by NoteEditor's draft mode
// (see index.tsx) to know the moment a new card actually needs a
// backing "cards" record -- an untouched draft (or one that's cleared
// again before typing anything) never creates one. Uses the same
// "does any textblock have real content" basis as
// internal/serve/ydoc.go's buildTitleAndPreview, so a card is created
// exactly when the server would derive a real (non-default) title
// from it.
export function draftConfirmPlugin(onConfirmed: () => void) {
  let fired = false;
  return new Plugin({
    appendTransaction(transactions, _oldState, newState) {
      if (fired || !transactions.some((tr) => tr.docChanged)) return null;

      let hasText = false;
      newState.doc.descendants((node) => {
        if (hasText) return false;
        if (node.isTextblock && node.textContent.trim() !== "") {
          hasText = true;
        }
      });

      if (hasText) {
        fired = true;
        onConfirmed();
      }
      return null;
    },
  });
}

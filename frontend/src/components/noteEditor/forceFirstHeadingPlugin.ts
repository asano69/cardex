import { Plugin } from "prosemirror-state";

// Ensures the document's first block is always a level-1 heading, so
// it can be styled with plain heading CSS instead of the previous
// ":first-child" override on a paragraph. Runs as an appendTransaction
// so it self-heals whenever the first block changes -- including the
// very first sync of an existing card (see NoteEditor), which
// automatically upgrades any old plain-paragraph title.
export function forceFirstHeadingPlugin() {
  return new Plugin({
    appendTransaction(transactions, _oldState, newState) {
      if (!transactions.some((tr) => tr.docChanged)) return null;

      const { heading } = newState.schema.nodes;
      const first = newState.doc.firstChild;
      if (!first || (first.type === heading && first.attrs.level === 1)) {
        return null;
      }

      return newState.tr.setNodeMarkup(0, heading, { level: 1 });
    },
  });
}

import { Plugin } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";

// Placeholder text shown when the document's title heading (see
// forceFirstHeadingPlugin) is empty. Rendered via CSS ::before (see
// styles/components.css's ".ProseMirror h1.is-empty::before"), not as
// real document content, so it's never saved or synced.
const PLACEHOLDER = "Untitled";

// Decorates the document's first block (always a level-1 heading, see
// forceFirstHeadingPlugin) with an "is-empty" class and a
// data-placeholder attribute whenever it has no content. ProseMirror
// still renders an empty block with a trailing <br>, so a plain CSS
// :empty selector can't detect this -- the decoration is what lets the
// CSS ::before rule know when to show the placeholder.
export function headingPlaceholderPlugin() {
  return new Plugin({
    props: {
      decorations(state) {
        const heading = state.doc.firstChild;
        if (!heading || heading.content.size > 0) {
          return null;
        }
        return DecorationSet.create(state.doc, [
          Decoration.node(0, heading.nodeSize, {
            class: "is-empty",
            "data-placeholder": PLACEHOLDER,
          }),
        ]);
      },
    },
  });
}

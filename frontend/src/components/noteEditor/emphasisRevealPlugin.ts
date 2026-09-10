import { Plugin, PluginKey } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import type { Node as PMNode, Selection } from "prosemirror-model";

const key = new PluginKey("emphasisReveal");

// *text* — no nested "*", no empty content, no leading/trailing space
// right after "*" (avoids matching "a * b * c").
const EMPHASIS_RE = /\*([^*\s][^*]*?)\*/g;

function buildDecorations(doc: PMNode, selection: Selection): DecorationSet {
  const decorations: Decoration[] = [];

  doc.descendants((node, pos) => {
    if (!node.isText) return;
    const text = node.text ?? "";

    for (const m of text.matchAll(EMPHASIS_RE)) {
      const from = pos + m.index!;
      const to = from + m[0].length;

      // "Touching" means the (empty) cursor sits anywhere from the
      // opening "*" through the closing "*", inclusive of both edges
      // — this is what makes the marker reappear the instant the
      // caret enters or reappears the instant it leaves (step 4/5).
      const touching =
        selection.empty && selection.from >= from && selection.from <= to;

      if (touching) {
        // Reveal the raw "*text*" but still render it bold.
        decorations.push(
          Decoration.inline(from, to, { class: "md-emphasis-editing" }),
        );
      } else {
        // Hide both "*" delimiters, bold only the inner text.
        decorations.push(
          Decoration.inline(from, from + 1, { class: "md-emphasis-marker" }),
          Decoration.inline(from + 1, to - 1, { class: "md-emphasis" }),
          Decoration.inline(to - 1, to, { class: "md-emphasis-marker" }),
        );
      }
    }
  });

  return DecorationSet.create(doc, decorations);
}

// Purely presentational: never touches the document itself, so the
// raw "*text*" syntax is always there to be revealed again. Recomputed
// on every doc change AND every selection change, since which match
// is "being edited" depends on cursor position, not just doc content.
export function emphasisRevealPlugin() {
  return new Plugin({
    key,
    state: {
      init(_, state) {
        return buildDecorations(state.doc, state.selection);
      },
      apply(tr, old, _oldState, newState) {
        if (!tr.docChanged && !tr.selectionSet) return old;
        return buildDecorations(newState.doc, newState.selection);
      },
    },
    props: {
      decorations(state) {
        return key.getState(state);
      },
    },
  });
}

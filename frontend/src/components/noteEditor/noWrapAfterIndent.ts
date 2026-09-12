import {
  EditorView,
  ViewPlugin,
  Decoration,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";

// Matches a line's leading run of tab / half-width space / full-width
// space characters (mirrors hangingIndent.ts's own regex).
const LEADING_INDENT_RUN_RE = /^[\t \u3000]+/;

// A single shared mark spec: forbids a line break inside the range it
// wraps.
const noWrapMark = Decoration.mark({
  attributes: {
    style: "white-space: normal; word-break: break-all;",
  },
});

// Wraps the character immediately after a line's leading indent run
// together with the character after THAT into one nowrap span, so the
// browser never inserts a soft-wrap break right at the indent/text
// boundary -- which would otherwise leave a wrapped continuation line
// starting with a visible, orphaned indent gap.
//
// Deliberately does NOT include the last indent character itself:
// hangingIndent.ts already replaces every leading indent character
// with its own widget via Decoration.replace(), and a Decoration.mark
// covering a range that's already been replaced has no effect (the
// replace wins). Starting this mark right after the indent run avoids
// that overlap entirely, so this can run alongside hangingIndent.
function buildDecorations(view: EditorView): DecorationSet {
  const decorations = [];
  for (const { from, to } of view.visibleRanges) {
    let pos = from;
    while (pos <= to) {
      const line = view.state.doc.lineAt(pos);
      const match = LEADING_INDENT_RUN_RE.exec(line.text);
      // Needs at least one indent char AND two following characters
      // to pair -- a line with only one character after the indent
      // has nothing to protect a boundary between.
      if (match && match[0].length + 1 < line.text.length) {
        const depth = match[0].length;
        const start = line.from + depth; // first real character
        const end = line.from + depth + 2; // + the character after it
        decorations.push(noWrapMark.range(start, end));
      }
      pos = line.to + 1;
    }
  }
  return Decoration.set(decorations, true);
}

export const noWrapAfterIndent = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildDecorations(update.view);
      }
    }
  },
  {
    decorations: (plugin) => plugin.decorations,
  },
);

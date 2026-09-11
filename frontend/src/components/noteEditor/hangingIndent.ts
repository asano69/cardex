import {
  EditorView,
  ViewPlugin,
  Decoration,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";

// How many CSS "ch" units (the width of the "0" character) one
// indent level's hanging indent occupies. Purely a rendering choice
// -- since the leading tab characters themselves are hidden (see
// buildDecorations below), this number has no relationship to the
// browser's own tab-size rendering; it only has to look reasonable.
export const INDENT_WIDTH_CH = 4;

const LEADING_TABS_RE = /^\t+/;

// CodeMirror has no built-in feature for hanging indent on wrapped
// lines -- confirmed by Marijn Haverbeke himself on the CodeMirror
// forum (see docs/code-mirror-migration.md). The standard technique
// (also shown in CodeMirror's own "Line Wrapping" example) is a
// per-line `padding-left`, so every wrapped row of a paragraph is
// pushed right by the same amount.
//
// The one wrinkle: `padding-left` on a line's block box applies to
// EVERY visual row of that line, including the first one -- which
// already contains the real leading tab characters, rendered at
// their own native width via the browser's tab-stop logic. Left
// alone, that means the first row gets shifted twice: once by its
// own tab characters, and again by padding-left. The classic fix is
// a matching negative `text-indent` to cancel padding-left back out
// on just the first row, but that relies on the browser's tab-stop
// math interacting correctly with a negative text-indent -- fragile,
// and the likely cause of the "looks like a line break" symptom this
// file replaces.
//
// Instead, the real leading tabs are hidden outright (zero-width, via
// Decoration.replace) so they contribute no width of their own.
// `padding-left` is then the ONLY source of the shift, applied
// uniformly to every row -- first and wrapped alike -- so there is
// nothing left to double-count. The tab characters still exist in
// the document (they're what indentMore/indentLess insert and
// remove, and what determines a line's indent depth here); this
// decoration only changes how they're rendered.
function buildDecorations(view: EditorView): DecorationSet {
  const decorations = [];
  for (const { from, to } of view.visibleRanges) {
    let pos = from;
    while (pos <= to) {
      const line = view.state.doc.lineAt(pos);
      const match = LEADING_TABS_RE.exec(line.text);
      if (match) {
        const depth = match[0].length;
        const width = `${depth * INDENT_WIDTH_CH}ch`;
        decorations.push(
          Decoration.line({
            attributes: { style: `padding-left: ${width};` },
          }).range(line.from),
        );
        decorations.push(
          Decoration.replace({}).range(line.from, line.from + depth),
        );
      }
      pos = line.to + 1;
    }
  }
  return Decoration.set(decorations, true);
}

export const hangingIndent = ViewPlugin.fromClass(
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

// Keeps the cursor from stepping through the hidden leading-tab
// characters one at a time -- without this, pressing the arrow keys
// can move the cursor with no visible on-screen change, which feels
// like it's stuck. Reuses hangingIndent's own decoration set (mirrors
// bulletAtomicRanges in bulletLineDecoration.ts); the zero-width line
// decorations mixed into that set are simply ignored here since they
// have no [from, to) span to be atomic over.
export const hangingIndentAtomicRanges = EditorView.atomicRanges.of(
  (view) => view.plugin(hangingIndent)?.decorations ?? Decoration.none,
);

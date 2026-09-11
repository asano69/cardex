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
// Instead, the real leading tabs are hidden via a mark decoration
// (font-size: 0, see editorTheme.ts's ".cm-hidden-tab") so they
// contribute no visible width of their own. `padding-left` is then
// the ONLY source of the shift, applied uniformly to every row --
// first and wrapped alike -- so there is nothing left to
// double-count. The tab characters still exist in the document
// (they're what indentMore/indentLess insert and remove, and what
// determines a line's indent depth here); this decoration only
// changes how they're rendered.
//
// A mark decoration is used here instead of Decoration.replace:
// replace decorations make CodeMirror insert invisible
// "cm-widgetBuffer" <img> placeholder nodes around the hidden range
// (needed so DOM selection can still address it), and each of those
// placeholders is its own atomic inline-level box -- which, per the
// CSS Text spec, carries an implicit soft-wrap opportunity at its
// boundary. With a very long line right after the indent (no spaces
// to wrap on otherwise), the browser would latch onto that
// opportunity and wrap immediately after the indent, producing a
// meaningless line break at the very start of the line. A mark
// decoration is just a plain (non-atomic) inline span, so it doesn't
// introduce that boundary.
//
// Even so, there's still an element boundary between the hidden tabs
// and the line's first real character, which is itself a soft-wrap
// opportunity by default. `cm-indent-glue` (covering the hidden tabs
// plus that one following character) forbids breaking inside itself
// via `white-space: nowrap`, so wrapping only ever kicks in once the
// line has actually run out of room -- never right at the start.
function buildDecorations(view: EditorView): {
  decorations: DecorationSet;
  atomic: DecorationSet;
} {
  const decorations = [];
  const atomic = [];
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

        const hiddenTab = Decoration.mark({ class: "cm-hidden-tab" }).range(
          line.from,
          line.from + depth,
        );
        decorations.push(hiddenTab);
        // Only the hidden-tab range should be atomic (see
        // hangingIndentAtomicRanges below) -- cm-indent-glue further
        // down also spans the first real character, and that
        // character must stay individually reachable by the cursor.
        atomic.push(hiddenTab);

        if (line.to > line.from + depth) {
          decorations.push(
            Decoration.mark({ class: "cm-indent-glue" }).range(
              line.from,
              line.from + depth + 1,
            ),
          );
        }
      }
      pos = line.to + 1;
    }
  }
  return {
    decorations: Decoration.set(decorations, true),
    atomic: Decoration.set(atomic, true),
  };
}

export const hangingIndent = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    atomic: DecorationSet;

    constructor(view: EditorView) {
      const built = buildDecorations(view);
      this.decorations = built.decorations;
      this.atomic = built.atomic;
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        const built = buildDecorations(update.view);
        this.decorations = built.decorations;
        this.atomic = built.atomic;
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
// like it's stuck. Only the hidden-tab ranges (not cm-indent-glue)
// are used here, so the first real character right after the indent
// stays individually reachable.
export const hangingIndentAtomicRanges = EditorView.atomicRanges.of(
  (view) => view.plugin(hangingIndent)?.atomic ?? Decoration.none,
);

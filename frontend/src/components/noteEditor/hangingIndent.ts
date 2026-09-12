import {
  EditorView,
  ViewPlugin,
  Decoration,
  WidgetType,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";

// Width of one indent level's mark element, in pixels (see
// IndentMarkWidget below). Also used by editorTheme.ts to size the
// ".indent-mark" element itself, so the two stay in sync.
export const INDENT_WIDTH_PX = 22.5;

// Diameter of the bullet dot drawn inside the last mark of a line's
// leading indent (see IndentMarkWidget below and editorTheme.ts's
// ".indent-mark .dot" rule).
export const DOT_SIZE_PX = 6;

// A single leading indent character: a tab (what Tab/Shift-Tab
// insert -- see index.tsx's indentUnit), or a half-width/full-width
// space (which can end up at a line's start via paste or IME input).
// Only matched at the very start of a line (see buildDecorations
// below), never mid-line.
const LEADING_INDENT_RUN_RE = /^[\t \u3000]+/;

// Renders one indent level as a fixed-width "indent-mark" box,
// replacing the underlying whitespace character 1:1 via
// Decoration.replace() (see buildDecorations). Because each mark
// stands in for exactly one document character, deleting it (e.g.
// Backspace right after it) behaves exactly like deleting any other
// single character -- no separate outdent command or atomic-range
// plumbing is needed for that anymore.
//
// Only the last mark in a line's leading run draws the bullet dot;
// every other mark is empty and only reserves horizontal space. The
// actual line-width reservation (so wrapped continuation rows line up
// under the first row's text) is handled separately by the ".indent"
// line class below (margin-left/text-indent) -- these marks only
// reserve space within the first visual row itself.
class IndentMarkWidget extends WidgetType {
  constructor(private readonly hasDot: boolean) {
    super();
  }

  eq(other: IndentMarkWidget) {
    return other.hasDot === this.hasDot;
  }

  toDOM() {
    const mark = document.createElement("span");
    mark.className = "indent-mark";
    // Without this, the browser treats the widget as ordinary
    // editable content and can place a native caret or click target
    // inside it.
    mark.contentEditable = "false";

    if (this.hasDot) {
      const dot = document.createElement("span");
      dot.className = "dot";
      mark.appendChild(dot);
    }

    return mark;
  }
}

// Builds, for each visible line with a leading indent run:
//   - one Decoration.replace() range per indent character, each
//     rendered as an "indent-mark" box (see IndentMarkWidget) -- this
//     is what makes the indent visible and lets a single Backspace
//     remove one level.
//   - a line-level ".indent" class carrying the total indent width as
//     a CSS variable (see editorTheme.ts's ".cm-line.indent" rule,
//     which turns this into margin-left/text-indent), so a wrapped
//     continuation row of the same line lines up under the first
//     row's real text. margin-left alone would double-indent the
//     first row, since the indent-mark elements already occupy that
//     width themselves there; the matching negative text-indent
//     cancels margin-left back out for exactly the first row, leaving
//     continuation rows indented by margin-left alone. Unlike the
//     previous font-size:0 + padding approach, this doesn't depend on
//     a native tab character's browser-dependent tab-stop width,
//     since each indent-mark is a plain, fixed-width element under
//     our own control.
function buildDecorations(view: EditorView): DecorationSet {
  const decorations = [];
  for (const { from, to } of view.visibleRanges) {
    let pos = from;
    while (pos <= to) {
      const line = view.state.doc.lineAt(pos);
      const match = LEADING_INDENT_RUN_RE.exec(line.text);
      if (match) {
        const depth = match[0].length;
        const width = depth * INDENT_WIDTH_PX;
        decorations.push(
          Decoration.line({
            class: "indent",
            attributes: { style: `--indent-width: ${width}px;` },
          }).range(line.from),
        );

        for (let i = 0; i < depth; i++) {
          decorations.push(
            Decoration.replace({
              widget: new IndentMarkWidget(i === depth - 1),
            }).range(line.from + i, line.from + i + 1),
          );
        }

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

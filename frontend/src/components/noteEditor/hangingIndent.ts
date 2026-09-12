import {
  EditorView,
  ViewPlugin,
  Decoration,
  WidgetType,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";

// Width of one indent level's pad element, in pixels (see PadWidget
// below). Also used by editorTheme.ts to size the ".pad" element
// itself, so the two stay in sync.
export const PAD_WIDTH_PX = 22.5;

// Diameter of the bullet dot drawn inside the last pad of a line's
// leading indent (see PadWidget below and editorTheme.ts's
// ".pad .dot" rule).
export const DOT_SIZE_PX = 6;

// A single leading indent character: a tab (what Tab/Shift-Tab
// insert -- see index.tsx's indentUnit), or a half-width/full-width
// space (which can end up at a line's start via paste or IME input).
// Only matched at the very start of a line (see buildDecorations
// below), never mid-line.
const LEADING_INDENT_RUN_RE = /^[\t \u3000]+/;

// Renders one indent level as a fixed-width "pad" box, replacing the
// underlying whitespace character 1:1 via Decoration.replace() (see
// buildDecorations). Because each pad stands in for exactly one
// document character, deleting it (e.g. Backspace right after it)
// behaves exactly like deleting any other single character -- no
// separate outdent command or atomic-range plumbing is needed for
// that anymore.
//
// Only the last pad in a line's leading run draws the bullet dot;
// every other pad is empty and only reserves horizontal space.
class PadWidget extends WidgetType {
  constructor(private readonly hasDot: boolean) {
    super();
  }

  eq(other: PadWidget) {
    return other.hasDot === this.hasDot;
  }

  toDOM() {
    const pad = document.createElement("span");
    pad.className = "pad";
    // Without this, the browser treats the widget as ordinary
    // editable content and can place a native caret or click target
    // inside it.
    pad.contentEditable = "false";

    if (this.hasDot) {
      const dot = document.createElement("span");
      dot.className = "dot";
      pad.appendChild(dot);
    }

    return pad;
  }
}

// Builds, for each visible line with a leading indent run:
//   - one Decoration.replace() range per indent character, each
//     rendered as a "pad" box (see PadWidget) -- this is what makes
//     the indent visible and lets a single Backspace remove one
//     level.
//   - a line-level padding-left/text-indent pair matching the total
//     indent width, so a wrapped continuation row of the same line
//     lines up under the first row's real text. padding-left alone
//     would double-indent the first row, since the pad elements
//     already occupy that width themselves there; the matching
//     negative text-indent cancels padding-left back out for exactly
//     the first row, leaving continuation rows indented by
//     padding-left alone. Unlike the previous font-size:0 + padding
//     approach, this doesn't depend on a native tab character's
//     browser-dependent tab-stop width, since each pad is a plain,
//     fixed-width element under our own control.
//   - a "cm-indent-glue" nowrap span covering the whole leading run
//     plus the first following character, so the browser never picks
//     a wrap point between two pads, or between the last pad and the
//     line's real text.
function buildDecorations(view: EditorView): DecorationSet {
  const decorations = [];
  for (const { from, to } of view.visibleRanges) {
    let pos = from;
    while (pos <= to) {
      const line = view.state.doc.lineAt(pos);
      const match = LEADING_INDENT_RUN_RE.exec(line.text);
      if (match) {
        const depth = match[0].length;
        const width = depth * PAD_WIDTH_PX;
        decorations.push(
          Decoration.line({
            attributes: {
              style: `padding-left: ${width}px; text-indent: -${width}px;`,
            },
          }).range(line.from),
        );

        for (let i = 0; i < depth; i++) {
          decorations.push(
            Decoration.replace({
              widget: new PadWidget(i === depth - 1),
            }).range(line.from + i, line.from + i + 1),
          );
        }

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

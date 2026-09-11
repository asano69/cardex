// frontend/src/components/noteEditor/bulletLineDecoration.ts
import {
  EditorView,
  ViewPlugin,
  Decoration,
  WidgetType,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";

// Replaces a single leading tab character with a precise, position-based
// marker: a fixed-width "pad" box that hides the real tab, plus (only on
// the innermost tab of a line -- see isLast) a "dot" drawn as an
// absolutely-positioned circle rather than a text glyph. The underlying
// document still stores a real tab character per indent level (see
// indentUnit.of("\t") in index.tsx) -- this widget only changes how
// that one character is rendered, so indentation depth still comes
// from the actual tabs and survives copy/paste unchanged.
class IndentMarkWidget extends WidgetType {
  constructor(
    private readonly index: number,
    // Only the last leading tab on a line gets a dot -- one bullet
    // per line, positioned at its actual indent depth, matching
    // Scrapbox/Cosense's own behavior. Earlier tabs are pure spacing.
    private readonly isLast: boolean,
  ) {
    super();
  }

  // Two widgets with the same index/isLast always render identically,
  // so CodeMirror can skip rebuilding the DOM node when nothing changed.
  eq(other: IndentMarkWidget) {
    return other.index === this.index && other.isLast === this.isLast;
  }

  toDOM() {
    const mark = document.createElement("span");
    mark.className = "indent-mark";
    // Without this, the browser treats this widget's DOM as normal
    // editable content: it can place a native caret inside the pad's
    // own text node (causing the cursor-position glitch right after
    // Tab creates a new widget) and lets the mouse click into the
    // padding as if it were real, selectable text. Marking the root
    // non-editable makes the browser skip straight past it and fall
    // back to CodeMirror's own position mapping instead.
    mark.contentEditable = "false";

    const charIndex = document.createElement("span");
    charIndex.className = `char-index c-${this.index}`;
    charIndex.dataset.charIndex = String(this.index);

    const pad = document.createElement("span");
    pad.className = "pad";
    pad.textContent = "\t"; // the real character this widget stands in for

    charIndex.appendChild(pad);
    mark.appendChild(charIndex);
    if (this.isLast) {
      mark.appendChild(document.createElement("span")).className = "dot";
    }

    return mark;
  }
}

const LEADING_TABS_RE = /^\t+/;

// Scans only the currently visible lines (not the whole document) for
// leading tabs and replaces each one, individually, with an
// IndentMarkWidget carrying its index among that line's leading tabs
// -- giving every indented line a single Scrapbox/Cosense-style bullet
// at its actual depth, while the stored content stays plain
// tab-indented text.
function buildDecorations(view: EditorView): DecorationSet {
  const widgets = [];
  for (const { from, to } of view.visibleRanges) {
    let pos = from;
    while (pos <= to) {
      const line = view.state.doc.lineAt(pos);
      const match = LEADING_TABS_RE.exec(line.text);
      if (match) {
        const count = match[0].length;
        for (let i = 0; i < count; i++) {
          const start = line.from + i;
          widgets.push(
            Decoration.replace({
              widget: new IndentMarkWidget(i, i === count - 1),
            }).range(start, start + 1),
          );
        }
      }
      pos = line.to + 1;
    }
  }
  return Decoration.set(widgets, true);
}

export const bulletLineDecoration = ViewPlugin.fromClass(
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

// Marks each IndentMarkWidget as a single atomic unit for cursor
// placement and motion. Without this, CodeMirror has no way to know
// the widget stands in for exactly one character, so the cursor can
// land inside the widget's own boundary -- the left-of-bullet drift
// right after Tab, and the "trapped" clickable space on either side
// of the dot, are both this same class of bug. Reuses the widget
// plugin's own decoration set, so there's only one source of truth
// for where the replacements are.
export const bulletAtomicRanges = EditorView.atomicRanges.of(
  (view) => view.plugin(bulletLineDecoration)?.decorations ?? Decoration.none,
);

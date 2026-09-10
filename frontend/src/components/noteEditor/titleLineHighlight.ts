import {
  EditorView,
  ViewPlugin,
  Decoration,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";

// The document's first line doubles as the card's title (see
// titleCandidatePlugin.ts), the same way the old ProseMirror editor
// forced its first block into an <h1> (see forceFirstHeadingPlugin.ts
// under prose-mirror.old/). CodeMirror has no per-line "node type" to
// hang a CSS rule off of, so this tags line 1 with a plain class
// instead -- see styles/components.css's .cm-title-line rule for the
// actual title styling (font size, color, margin).
function buildDecoration(view: EditorView): DecorationSet {
  const line = view.state.doc.line(1);
  return Decoration.set([
    Decoration.line({ class: "cm-title-line" }).range(line.from),
  ]);
}

export const titleLineHighlight = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildDecoration(view);
    }

    update(update: ViewUpdate) {
      // Line 1's boundaries only move when the doc itself changes
      // (typing, remote Yjs edits, ...); a pure selection change never
      // needs a new decoration set.
      if (update.docChanged) {
        this.decorations = buildDecoration(update.view);
      }
    }
  },
  {
    decorations: (plugin) => plugin.decorations,
  },
);

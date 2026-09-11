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

// Styling for .cm-title-line via EditorView.theme(), not a plain CSS
// rule in components.css: CodeMirror injects its own .cm-line padding
// as an unlayered "base theme" at runtime, and per the CSS Cascade
// Layers spec, unlayered rules always beat rules inside Tailwind's
// `@layer components` regardless of selector specificity -- that's
// also why font-family needed !important there. EditorView.theme()
// is CodeMirror's own supported mechanism for overriding its base
// theme, so this wins without needing !important.
export const titleLineTheme = EditorView.theme({
  ".cm-line.cm-title-line": {
    fontFamily: "var(--font-sans)",
    fontSize: "1.73rem",
    color: "var(--color-line-title)",
    lineHeight: "42px",
    paddingBottom: "21px",
  },
});

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

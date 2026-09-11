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
// instead -- see editorTheme.ts's ".cm-line.cm-title-line" rule for
// the actual title styling (font size, color, margin).
function buildDecoration(view: EditorView): DecorationSet {
  const line = view.state.doc.line(1);
  return Decoration.set([
    Decoration.line({ class: "cm-title-line" }).range(line.from),
  ]);
}

// Editor-wide style overrides via EditorView.theme(), not plain CSS in
// components.css: CodeMirror injects its own base theme as unlayered
// runtime <style>, and per the CSS Cascade Layers spec, unlayered
// rules always beat rules inside Tailwind's `@layer components`
// regardless of selector specificity -- that's why these previously
// needed !important there. EditorView.theme() is CodeMirror's own
// supported mechanism for overriding its base theme, so it wins
// without !important. Only rules that actually conflicted with
// CodeMirror's base theme (outline, font-family, the title line) live
// here -- .cm-content's padding and .cm-line's line-height are left
// as plain CSS in components.css since they aren't contested by any
// base theme rule and don't need this.
export const editorTheme = EditorView.theme({
  "&.cm-focused": {
    outline: "none",
  },
  ".cm-scroller": {
    fontFamily: "var(--font-sans)",
  },
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

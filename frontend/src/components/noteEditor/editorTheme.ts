import { EditorView } from "@codemirror/view";
import { PAD_WIDTH_PX, DOT_SIZE_PX } from "./hangingIndent";

// All CodeMirror-specific styling lives here via EditorView.theme(),
// not as plain CSS in styles/components.css. CodeMirror injects its
// own base theme as unlayered runtime <style>, and per the CSS
// Cascade Layers spec, unlayered rules always beat rules inside
// Tailwind's `@layer components` regardless of selector specificity
// -- so CSS here previously needed !important just to apply at all
// (see git history). Keeping every CodeMirror override in one
// EditorView.theme() avoids that fight entirely and keeps
// components.css focused on this app's own Tailwind-authored classes,
// not a third-party editor's internals.
//
// CSS custom properties from styles/theme.css (var(--color-*), etc.)
// work the same way here as in plain CSS, so this still shares the
// same design tokens as the rest of the app.
export const editorTheme = EditorView.theme({
  "&.cm-focused": {
    outline: "none",
  },
  ".cm-scroller": {
    fontFamily: "var(--font-sans)",
  },
  ".cm-content": {
    padding: "0",
  },
  ".cm-line": {
    lineHeight: "1.7",
  },
  ".cm-line.cm-title-line": {
    fontFamily: "var(--font-sans)",
    fontSize: "1.73rem",
    color: "var(--color-line-title)",
    // A fixed unitless-looking px value, not "normal" -- matches the
    // line's own calc(1em + 1rem) elsewhere so an empty title line
    // and a text-filled one report the same caret height.
    lineHeight: "42px",
    paddingBottom: "21px",
  },
  // Forbids wrapping between a hanging-indent line's pad elements (or
  // between the last pad and its first real character) -- see
  // hangingIndent.ts's buildDecorations. Without this, the element
  // boundaries there are themselves soft-wrap opportunities, so a
  // long, space-less line could wrap in the middle of its own indent.
  ".cm-indent-glue": {
    whiteSpace: "nowrap",
  },
  // One indent level's pad box (see hangingIndent.ts's PadWidget),
  // replacing the underlying whitespace character 1:1. Fixed-width
  // and non-editable so it renders and behaves like a single
  // character rather than like ordinary text content.
  ".pad": {
    position: "relative",
    display: "inline-block",
    width: `${PAD_WIDTH_PX}px`,
    // Explicit 1em height, matching the text's own font box rather
    // than the taller line-height box (1.7, see .cm-line above), so
    // the dot's top:50% centering below lines up with the glyphs'
    // actual vertical center.
    height: "1em",
    lineHeight: "1",
    verticalAlign: "middle",
  },
  // Bullet dot drawn inside a line's last pad only (see PadWidget's
  // `hasDot`), centered within that pad's box.
  ".pad .dot": {
    position: "absolute",
    display: "block",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    width: `${DOT_SIZE_PX}px`,
    height: `${DOT_SIZE_PX}px`,
    borderRadius: "50%",
    backgroundColor: "var(--color-line-text)",
  },
});

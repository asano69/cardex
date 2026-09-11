import { EditorView } from "@codemirror/view";

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
  // Collapses a hanging-indent line's leading tab characters to zero
  // visible width (see hangingIndent.ts). font-size: 0 keeps this an
  // ordinary inline span rather than an atomic replaced box, so it
  // doesn't introduce its own soft-wrap opportunity.
  ".cm-hidden-tab": {
    fontSize: "0",
  },
  // Forbids wrapping between a hanging-indent line's hidden tabs and
  // its first real character (see hangingIndent.ts) -- without this,
  // the element boundary there is itself a soft-wrap opportunity, so
  // a long, space-less line would wrap right after the indent instead
  // of once it actually runs out of room.
  ".cm-indent-glue": {
    whiteSpace: "nowrap",
  },
  // Bullet dot for each indented line's leading tabs (see
  // bulletDotWidget.ts's BulletDotWidget), inserted as a real element
  // via Decoration.widget() rather than Decoration.replace() -- so it
  // never needs an atomic cm-widgetBuffer placeholder around it,
  // which is what caused unwanted mid-word wraps in the earlier
  // implementation (see hangingIndent.ts's own comment on the same
  // issue). No separate ".pad" spacer element is needed anymore: the
  // real tab characters are already hidden by this file's own
  // ".cm-hidden-tab" rule, and the horizontal gutter they'd otherwise
  // occupy is already reserved by that same rule's line-level
  // padding-left -- ".indent-mark" just anchors the dot at the point
  // where the hidden tabs end, and ".dot" pulls it back left into
  // that gutter via calc() off its own --dot-size.
  ".indent-mark": {
    position: "relative",
    display: "inline-block",
    // Explicit 1em height, matching the text's own font box rather
    // than the taller line-height box (1.7, see .cm-line above).
    // The dot's top:50% centering below is measured against this
    // height -- without it, the mark's auto height follows the
    // line-height instead, pushing the dot below the glyphs' actual
    // vertical center.
    height: "1em",
    lineHeight: "1",
    verticalAlign: "middle",
  },
  ".indent-mark .dot": {
    display: "block",
    position: "absolute",
    "--dot-size": "6px",
    left: "calc(-1 * var(--dot-size) - 9px)",
    // Centered on the indent-mark's own 1em box (see above), which
    // now lines up with the text's actual vertical center.
    top: "50%",
    marginTop: "calc(-1 * var(--dot-size) / 2)",
    width: "var(--dot-size)",
    height: "var(--dot-size)",
    borderRadius: "50%",
    backgroundColor: "var(--color-line-text)",
  },
});

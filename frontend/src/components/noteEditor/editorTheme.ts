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
  // Visual-only indent marker replacing each leading tab character
  // (see bulletLineDecoration.ts's IndentMarkWidget). The indentation
  // itself still comes from the real tab characters in the document
  // -- ".pad" hides that character inside a fixed-width box, and
  // ".dot" is drawn as an absolutely-positioned circle rather than a
  // text glyph, so its size/placement never depends on font metrics.
  ".indent-mark": {
    position: "relative",
    display: "inline-block",
  },
  ".indent-mark .pad": {
    display: "inline-block",
    width: "1.5em",
    height: "1em",
    overflow: "hidden",
    textOverflow: "hidden",
  },
  ".indent-mark .dot": {
    display: "block",
    position: "absolute",
    right: "9px",
    // Centered on the line's vertical midpoint via top:50% + a
    // negative margin of exactly half the dot's own height --
    // ties margin-top to the height value below, instead of an
    // independently hardcoded px number that would silently drift
    // out of sync if the dot's size ever changed.
    top: "50%",
    marginTop: "calc(-1 * 6px / 2)",
    width: "6px",
    height: "6px",
    borderRadius: "50%",
    backgroundColor: "var(--color-line-text)",
  },
});

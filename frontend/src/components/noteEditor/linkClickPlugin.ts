import { Plugin } from "prosemirror-state";

// Opens links on a plain left-click instead of requiring Ctrl/Cmd-click,
// which is the browser's default click behavior inside a contenteditable
// region. Reads the href straight off the rendered <a> element rather
// than resolving marks at the click position, since that sidesteps the
// usual ProseMirror edge cases around mark boundaries (start/end of a
// link) and matches exactly what the user visually clicked on.
//
// Trade-off: clicking a link now always navigates, so there's no
// dedicated gesture left to place the cursor inside linked text (e.g.
// to fix a typo in the URL). Editing it means selecting the link (e.g.
// via keyboard) and retyping, or clicking just outside it and using the
// arrow keys to move in.
export function linkClickPlugin() {
  return new Plugin({
    props: {
      handleClick(_view, _pos, event) {
        if (event.button !== 0) return false; // left click only

        const target = event.target as HTMLElement | null;
        const anchor = target?.closest?.("a[href]") as HTMLAnchorElement | null;
        if (!anchor) return false;

        event.preventDefault();
        window.open(anchor.href, "_blank", "noopener,noreferrer");
        return true;
      },
    },
  });
}

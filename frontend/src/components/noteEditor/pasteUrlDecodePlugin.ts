import { Plugin } from "prosemirror-state";

// Detects a paste whose entire clipboard text is a single
// percent-encoded URL (e.g. a Japanese Wikipedia link copied as
// "https://ja.wikipedia.org/wiki/%E6%97%A5%E6%9C%AC") and decodes it
// before insertion, so the pasted text reads as normal Japanese
// instead of staying percent-encoded. urlLinkRule.ts's own regex scan
// still picks up the decoded text as a link afterward, since Japanese
// characters aren't excluded by its pattern.
const FULL_URL_RE = /^https?:\/\/\S+$/;
const PERCENT_ENCODED_RE = /%[0-9A-Fa-f]{2}/;

export function pasteUrlDecodePlugin() {
  return new Plugin({
    props: {
      handlePaste(view, event) {
        const text = event.clipboardData?.getData("text/plain").trim();
        if (!text || !FULL_URL_RE.test(text) || !PERCENT_ENCODED_RE.test(text)) {
          return false; // not a single percent-encoded URL -- default paste behavior
        }

        let decoded: string;
        try {
          decoded = decodeURIComponent(text);
        } catch {
          return false; // malformed percent-encoding -- fall back to default paste
        }

        const { state, dispatch } = view;
        dispatch(
          state.tr.insertText(decoded, state.selection.from, state.selection.to),
        );
        return true;
      },
    },
  });
}

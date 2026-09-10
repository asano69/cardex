import type { MarkdownConfig, InlineParser } from "@lezer/markdown";
import { tags as t } from "@lezer/highlight";

const HASH = 35; // '#'
const TAG_WORD_RE = /^[\w-]+/;

const tagParser: InlineParser = {
  name: "Tag",
  parse(cx, next, pos) {
    if (next != HASH) return -1;
    const rest = cx.slice(pos + 1, cx.end);
    const m = TAG_WORD_RE.exec(rest);
    if (!m) return -1;
    return cx.addElement(cx.elt("Tag", pos, pos + 1 + m[0].length));
  },
};

export const cardpotTagSyntax: MarkdownConfig = {
  defineNodes: [{ name: "Tag", style: t.labelName }],
  parseInline: [tagParser],
};

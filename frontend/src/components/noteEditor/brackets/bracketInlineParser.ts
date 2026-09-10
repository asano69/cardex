import type { MarkdownConfig, InlineParser } from "@lezer/markdown";
import { tags as t } from "@lezer/highlight";
import { bracketRules } from "./bracketRules";

const OPEN_BRACKET = 91; // '['

// Matches the innards of a single bracket pair up to the first "]" --
// no nested brackets, so "[[Some Page]]" is left for wikiLinkParser
// below rather than being read as a malformed PageBracket.
const BRACKET_CONTENT_RE = /^([^[\]]+)\]/;

// [[Some Page]] -> a Scrapbox/Cosense-style wiki link. Tried before
// the single-bracket parser below, since both start on the same "["
// character.
const wikiLinkParser: InlineParser = {
  name: "WikiLink",
  parse(cx, next, pos) {
    if (next != OPEN_BRACKET) return -1;
    const rest = cx.slice(pos, cx.end);
    if (!rest.startsWith("[[")) return -1;

    const closeIndex = rest.indexOf("]]", 2);
    if (closeIndex < 0) return -1;

    return cx.addElement(cx.elt("WikiLink", pos, pos + closeIndex + 2));
  },
};

// [inner] -> whichever bracket notation `inner` matches (see
// bracketRules.ts). PageBracket is always a match (its test always
// returns true), so a bare "[Word]" is always recognized as something.
const bracketParser: InlineParser = {
  name: "Bracket",
  parse(cx, next, pos) {
    if (next != OPEN_BRACKET) return -1;

    const rest = cx.slice(pos + 1, cx.end);
    const m = BRACKET_CONTENT_RE.exec(rest);
    if (!m) return -1;

    const inner = m[1];
    const rule = bracketRules.find((r) => r.test(inner));
    if (!rule) return -1;

    return cx.addElement(cx.elt(rule.nodeName, pos, pos + 1 + m[0].length));
  },
};

export const cardpotBracketSyntax: MarkdownConfig = {
  defineNodes: [
    { name: "WikiLink", style: t.link },
    ...bracketRules.map((rule) => ({ name: rule.nodeName, style: rule.style })),
  ],
  parseInline: [wikiLinkParser, bracketParser],
};

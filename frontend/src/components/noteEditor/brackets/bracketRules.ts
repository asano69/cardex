import { tags as t } from "@lezer/highlight";

// One entry per bracket notation. Adding a new notation means adding
// one entry here plus a widget (if it renders as something other than
// plain styled text) -- nothing else in this directory needs to change.
export interface BracketRule {
  nodeName: string;
  // Called with the bracket's inner text (without the brackets
  // themselves). First matching rule wins.
  test: (inner: string) => boolean;
  style: unknown; // a @lezer/highlight Tag, e.g. t.link
}

const ICON_RE = /^[\w-]+\.icon$/;
const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|svg)$/i;
const URL_RE = /^https?:\/\//;

export const bracketRules: BracketRule[] = [
  {
    nodeName: "IconBracket",
    test: (inner) => ICON_RE.test(inner),
    style: t.character,
  },
  {
    nodeName: "ImageBracket",
    test: (inner) => URL_RE.test(inner) && IMAGE_EXT_RE.test(inner),
    style: t.link,
  },
  {
    nodeName: "URLBracket",
    test: (inner) => URL_RE.test(inner),
    style: t.link,
  },
  {
    // Fallback: bare [Word] -> Scrapbox-style link, same
    // classification as internal/slug.StripBracketLinks on the
    // server side.
    nodeName: "PageBracket",
    test: () => true,
    style: t.link,
  },
];

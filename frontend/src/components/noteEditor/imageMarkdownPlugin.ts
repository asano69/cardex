import { Plugin } from "prosemirror-state";
import type { Transaction } from "prosemirror-state";
import type { Node as PMNode } from "prosemirror-model";

// Markdown image syntax: ![alt](http(s)://...). The "![" prefix
// already makes this unambiguous, so unlike the bracket pattern below
// there's no need to also require an image file extension -- CDN and
// server-rendered image URLs often have none.
const MARKDOWN_IMAGE_RE = /!\[([^\]]*)\]\((https?:\/\/\S+?)\)/g;

// A bare URL that fills an entire bracket pair with nothing else
// inside, e.g. "[https://example.com/cat.png]" or
// "[https://example.com/render?id=1]" (no file extension needed).
// This is what keeps it distinct from Scrapbox-style bracket links
// (see internal/slug.StripBracketLinks / urlLinkRule.ts): a bracket
// link's content is one or more words separated by spaces/nested
// brackets, whereas this only matches when the bracket's ENTIRE
// content -- no surrounding words, no internal whitespace -- is a
// single http(s) URL.
const BRACKETED_IMAGE_URL_RE = /\[(https?:\/\/[^\s[\]]+)\]/g;

interface ImageMatch {
  from: number;
  to: number;
  src: string;
  alt: string;
}

// Scans every text node in `doc` for either pattern above, returning
// matches sorted so the last one in the document comes first -- that
// way replacing them in order never shifts the position of a match
// still waiting to be processed.
function findImageMatches(doc: PMNode): ImageMatch[] {
  const matches: ImageMatch[] = [];

  doc.descendants((node, pos) => {
    if (!node.isText) return;
    const text = node.text ?? "";

    for (const m of text.matchAll(MARKDOWN_IMAGE_RE)) {
      matches.push({
        from: pos + m.index!,
        to: pos + m.index! + m[0].length,
        alt: m[1],
        src: m[2],
      });
    }
    for (const m of text.matchAll(BRACKETED_IMAGE_URL_RE)) {
      matches.push({
        from: pos + m.index!,
        to: pos + m.index! + m[0].length,
        alt: "",
        src: m[1],
      });
    }
  });

  return matches.sort((a, b) => b.from - a.from);
}

// Converts Markdown image syntax (![alt](url)) and bracket-wrapped
// bare image URLs ([https://.../cat.png]) into real image nodes as
// soon as either pattern appears anywhere in the document. Runs as an
// appendTransaction (same pattern as blockIdPlugin/
// forceFirstHeadingPlugin), so it fires the same way whether the text
// arrived by typing or by paste.
export function imageMarkdownPlugin() {
  return new Plugin({
    appendTransaction(transactions, _oldState, newState) {
      if (!transactions.some((tr) => tr.docChanged)) return null;

      const { image } = newState.schema.nodes;
      if (!image) return null;

      const matches = findImageMatches(newState.doc);
      if (matches.length === 0) return null;

      let tr: Transaction | null = null;
      for (const match of matches) {
        tr = (tr ?? newState.tr).replaceWith(
          match.from,
          match.to,
          image.create({ src: match.src, alt: match.alt || null }),
        );
      }
      return tr;
    },
  });
}

import { Plugin } from "prosemirror-state";
import type { Transaction } from "prosemirror-state";
import type { Node as PMNode } from "prosemirror-model";

// Markdown image syntax: ![alt](url)
const MARKDOWN_IMAGE_RE = /!\[([^\]]*)\]\((\S+?)\)/g;

// A bare image URL wrapped in plain brackets, e.g.
// "[https://example.com/cat.png]" -- distinguished from a normal
// bracket link (see urlLinkRule.ts) purely by the file extension.
const BRACKETED_IMAGE_URL_RE =
  /\[(https?:\/\/[^\s[\]]+\.(?:png|jpe?g|gif|webp|svg)(?:\?\S*)?)\]/gi;

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

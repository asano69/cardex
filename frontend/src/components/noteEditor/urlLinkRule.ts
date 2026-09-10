import { Plugin } from "prosemirror-state";
import type { Node as PMNode } from "prosemirror-model";
import { markSynthetic } from "./syntheticTransaction";

// Only treats text as a link when it starts with an explicit http(s)
// scheme. This is stricter than typical autolink detection (which
// also links bare "word.tld" text against a real-TLD list, so e.g.
// "goog.com" gets linked) while also being more permissive about the
// host itself, so "http://localhost:3001/..." is recognized even
// though "localhost" isn't a real TLD.
const URL_RE = /https?:\/\/[^\s<>"')\]]+/g;

interface UrlMatch {
  from: number;
  to: number;
  href: string;
}

// Scans every text node in `doc` for URL_RE, returning every match's
// absolute position range and href.
function findUrlMatches(doc: PMNode): UrlMatch[] {
  const matches: UrlMatch[] = [];
  doc.descendants((node, pos) => {
    if (!node.isText) return;
    const text = node.text ?? "";
    for (const m of text.matchAll(URL_RE)) {
      matches.push({
        from: pos + m.index!,
        to: pos + m.index! + m[0].length,
        href: m[0],
      });
    }
  });
  return matches;
}

// Auto-applies the "link" mark to any text starting with an explicit
// http(s) scheme, re-scanning the whole document on every transaction
// that changes it (typing and pasting alike) -- the same "always
// re-derive from the current text" approach this editor's link
// detection has always used, now written as a plain Plugin instead of
// depending on ProseKit's mark-rule extension.
//
// The whole document's link marks are recomputed from scratch on
// every change rather than diffed incrementally: this editor has no
// manual "insert link" affordance, so there is no user-applied link
// mark a full recompute could ever clobber, and ProseMirror's own
// addMark/removeMark already skip generating a step when a range's
// marks wouldn't actually change -- so an edit far away from any URL
// still produces no-op transaction (see forceFirstHeadingPlugin.ts for
// the same "return null when nothing changed" pattern).
//
// Must run after imageMarkdownPlugin in the plugins array: that
// plugin consumes markdown/bracket image syntax into an image node
// first, so there's nothing left of a converted image URL for this
// plugin to mark as a link (see imageMarkdownPlugin.ts).
export function urlLinkPlugin() {
  return new Plugin({
    appendTransaction(transactions, _oldState, newState) {
      if (!transactions.some((tr) => tr.docChanged)) return null;

      const { link } = newState.schema.marks;
      if (!link) return null;

      const tr = newState.tr;
      tr.removeMark(0, newState.doc.content.size, link);
      for (const match of findUrlMatches(newState.doc)) {
        tr.addMark(match.from, match.to, link.create({ href: match.href }));
      }
      // Marked synthetic: this is a self-heal, not a user edit -- see
      // syntheticTransaction.ts for why that distinction matters.
      return tr.docChanged ? markSynthetic(tr) : null;
    },
  });
}

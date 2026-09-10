import type { Transaction } from "prosemirror-state";

// Shared marker for transactions that "infra" plugins (self-healing
// plugins that run on every doc change, e.g. forceFirstHeadingPlugin,
// blockIdPlugin, imageMarkdownPlugin, urlLinkPlugin) append on their
// own -- as opposed to a transaction that reflects an actual user
// edit (typing, pasting, ...). titleCandidatePlugin needs to tell the
// two apart: without this, e.g. blockIdPlugin assigning a UUID to the
// very first paragraph ySyncPlugin creates while seeding a brand-new
// empty Y.Doc looks exactly like "the user typed something", which
// used to start (and eventually fire) the title-confirmation debounce
// on a draft nobody had touched yet -- silently creating an
// "Untitled" card the moment /:pot/new was opened.
const SYNTHETIC_META = "cardpot-synthetic-tr";

export function markSynthetic(tr: Transaction): Transaction {
  return tr.setMeta(SYNTHETIC_META, true);
}

export function isSynthetic(tr: Transaction): boolean {
  return tr.getMeta(SYNTHETIC_META) === true;
}

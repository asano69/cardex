import type { Transaction } from "prosemirror-state";

// Shared marker for a transaction that NoteEditor dispatches itself,
// programmatically, outside of any real user action -- e.g. seeding a
// brand-new draft's first line with a title candidate (see index.tsx)
// or filling a blank "Untitled" heading. titleCandidatePlugin needs
// to tell these apart from an actual user edit (typing, pasting), or
// a programmatic seed alone starts (and eventually fires) the
// title-confirmation debounce with no real user action behind it.
//
// This is deliberately NOT used for appendTransaction-based
// self-healing plugins (forceFirstHeadingPlugin, blockIdPlugin,
// imageMarkdownPlugin, urlLinkPlugin): ProseMirror already tags any
// transaction returned from a plugin's own appendTransaction with a
// built-in "appendedTransaction" meta (see titleCandidatePlugin),
// so those need no marking here at all.
const SYNTHETIC_META = "cardpot-synthetic-tr";

export function markSynthetic(tr: Transaction): Transaction {
  return tr.setMeta(SYNTHETIC_META, true);
}

export function isSynthetic(tr: Transaction): boolean {
  return tr.getMeta(SYNTHETIC_META) === true;
}

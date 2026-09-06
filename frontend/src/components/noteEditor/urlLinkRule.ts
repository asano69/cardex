import { defineMarkRule } from "prosekit/extensions/mark-rule";

// Only treats text as a link when it starts with an explicit http(s)
// scheme. This is stricter than prosekit's built-in link detection
// (which also links bare "word.tld" text against a real-TLD list, so
// e.g. "goog.com" gets linked) while also being more permissive about
// the host itself, so "http://localhost:3001/..." is recognized even
// though "localhost" isn't a real TLD. Re-scans on every transaction
// (typing and pasting alike), same mechanism prosekit's own link
// extension uses internally.
const URL_RE = /https?:\/\/[^\s<>"')\]]+/g;

export function defineUrlLinkRule() {
  return defineMarkRule({
    regex: URL_RE,
    type: "link",
    attrs: (match) => ({ href: match[0] }),
  });
}

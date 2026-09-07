// A title candidate is text extracted from a card's live document
// (see slugCandidatePlugin.ts's extractCandidate) that has not yet
// been resolved into a real slug/title by the server. Branded so a
// plain, unvalidated string -- e.g. a card's already-resolved
// `title` field from cardsStore -- can't be passed anywhere a
// candidate is expected; only makeTitleCandidate() can produce one.
// The brand only exists at the TypeScript level: it's erased once
// the value crosses the network as a JSON request body (see
// lib/cardApi.ts), which is expected -- the server re-derives its
// own guarantees independently (see internal/serve/slug.go).
export type TitleCandidate = string & { readonly __brand: "TitleCandidate" };

// The only way to produce a TitleCandidate: trims the input first, so
// every candidate reaching the server is already whitespace-trimmed
// regardless of where it was extracted from.
export function makeTitleCandidate(text: string): TitleCandidate {
  return text.trim() as TitleCandidate;
}

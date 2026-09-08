// A card's genuine display title, as resolved and stored server-side
// (see internal/serve/ydoc.go's buildTitleAndPreview / resolveCardTitle).
// Branded so a plain, unvalidated string can't be passed anywhere a
// resolved card title is expected -- distinguishing it from a raw,
// unresolved TitleCandidate (see titleCandidate.ts) or from a card's
// slug.
export type CardTitle = string & { readonly __brand: "CardTitle" };

// Wraps a value already known to be a resolved card title, e.g. a
// PocketBase "cards" record's "title" field. Performs no validation of
// its own -- the server is the actual source of truth for title
// resolution/uniqueness (see internal/serve/slug.go).
export function asCardTitle(title: string): CardTitle {
  return title as CardTitle;
}

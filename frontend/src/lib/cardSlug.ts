//
// Converts between a card's slug and the URL path segment used to
// display it (see routes/cards/CardForm.tsx and CardItem.tsx). The
// "cards" slug field never contains a literal space -- the server
// always normalizes spaces to underscores when resolving it from the
// candidate text (see resolveCardSlug in internal/serve/slug.go) -- so
// this only needs to percent-encode the handful of characters that are
// actually unsafe in a path segment (% / # ?). Everything else,
// including non-ASCII text such as Japanese and the underscores the
// slug is already made of, is left as-is so it shows up literally in
// the browser instead of being percent-encoded the way
// encodeURIComponent would do it.
//
// Card slugs are unique within an issue (enforced at the database
// level), so the segment doubles as the lookup key: CardForm resolves
// the actual PocketBase record id by matching on the decoded slug. The
// backend never stores an empty slug -- an empty document's slug
// always resolves to the literal string "Untitled" instead (see
// resolveCardSlug in internal/serve/slug.go) -- so this doesn't need
// any special-casing for an empty slug.

function encodeUnsafeChars(slug: string): string {
  return slug
    .replaceAll("%", "%25") // must run first, or the escapes below would be double-encoded
    .replaceAll("/", "%2F")
    .replaceAll("#", "%23")
    .replaceAll("?", "%3F");
}

export function cardSlugToSegment(slug: string): string {
  return encodeUnsafeChars(slug);
}

export function segmentToCardSlug(segment: string): string {
  return decodeURIComponent(segment);
}

//
// Converts between a card's title and the URL path segment used to
// display it (see routes/issues/CardForm.tsx and CardItem.tsx). The
// "cards" title field never contains a literal space -- the server
// always normalizes spaces to underscores when deriving it from the
// document's heading (see buildTitleAndPreview in
// internal/serve/ydoc.go) -- so this only needs to percent-encode the
// handful of characters that are actually unsafe in a path segment
// (% / # ?). Everything else, including non-ASCII text such as
// Japanese and the underscores the title is already made of, is left
// as-is so it shows up literally in the browser instead of being
// percent-encoded the way encodeURIComponent would do it.
//
// Card titles are unique within an issue (enforced at the database
// level), so the segment doubles as the lookup key: CardForm resolves
// the actual PocketBase record id by matching on the decoded title.
// The backend never stores an empty title -- an empty document's
// title always resolves to the literal string "Untitled" instead (see
// defaultTitle in internal/serve/ydoc.go) -- so this doesn't need any
// special-casing for an empty title.

function encodeUnsafeChars(title: string): string {
  return title
    .replaceAll("%", "%25") // must run first, or the escapes below would be double-encoded
    .replaceAll("/", "%2F")
    .replaceAll("#", "%23")
    .replaceAll("?", "%3F");
}

export function cardTitleToSegment(title: string): string {
  return encodeUnsafeChars(title);
}

export function segmentToCardTitle(segment: string): string {
  return decodeURIComponent(segment);
}

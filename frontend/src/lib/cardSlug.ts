//
// Converts between a card's title and the URL path segment used to
// display it (see routes/issues/CardForm.tsx and CardItem.tsx). Plain
// spaces become underscores so the address bar doesn't fill up with
// "%20", and only the handful of characters that are actually unsafe
// in a path segment (% / # ?) are percent-encoded -- everything else,
// including non-ASCII text such as Japanese, is left as-is so it
// shows up literally in the browser instead of being percent-encoded
// the way encodeURIComponent would do it.
//
// Card titles are unique within an issue (enforced at the database
// level), so the segment doubles as the lookup key: CardForm resolves
// the actual PocketBase record id by matching on the decoded title.
// An empty title (a brand-new card before anything has been typed) is
// mapped to the literal "Untitled" segment instead, matching the
// placeholder text shown in the editor itself (see
// noteEditor/headingPlaceholderPlugin.ts).
const EMPTY_TITLE_SEGMENT = "Untitled";

function encodeUnsafeChars(title: string): string {
  return title
    .replaceAll("%", "%25") // must run first, or the escapes below would be double-encoded
    .replaceAll("/", "%2F")
    .replaceAll("#", "%23")
    .replaceAll("?", "%3F")
    .replaceAll(" ", "_");
}

function decodeUnsafeChars(segment: string): string {
  // decodeURIComponent alone reverses every %XX escape produced above,
  // since they're all valid percent-encoding -- only the underscore
  // swap needs to be done explicitly.
  return decodeURIComponent(segment).replaceAll("_", " ");
}

export function cardTitleToSegment(title: string): string {
  return title === "" ? EMPTY_TITLE_SEGMENT : encodeUnsafeChars(title);
}

export function segmentToCardTitle(segment: string): string {
  return segment === EMPTY_TITLE_SEGMENT ? "" : decodeUnsafeChars(segment);
}

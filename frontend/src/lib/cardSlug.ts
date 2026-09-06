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
// The backend never stores an empty title -- an empty document's
// title always resolves to the literal string "Untitled" instead (see
// defaultTitle in internal/serve/ydoc.go) -- so this doesn't need any
// special-casing for an empty title.

function encodeUnsafeChars(title: string): string {
  return title
    .replaceAll("%", "%25") // must run first, or the escapes below would be double-encoded
    .replaceAll("/", "%2F")
    .replaceAll("#", "%23")
    .replaceAll("?", "%3F")
    .replaceAll(" ", "_");
}

// Backend-appended dedup suffix for same-titled cards within an issue
// (see resolveUniqueTitle in internal/serve/ydoc.go, which literally
// appends "_<n>" to the title on collision). That suffix is a real
// underscore, not an encoded space, so it must survive decoding
// unchanged -- otherwise a card disambiguated to e.g. "a_2" can never
// be looked up again (its segment would decode to "a 2").
const DEDUP_SUFFIX_RE = /_\d+$/;

function decodeUnsafeChars(segment: string): string {
  // decodeURIComponent alone reverses every %XX escape produced above,
  // since they're all valid percent-encoding. The "_" -> " " swap only
  // applies to the part before any trailing dedup suffix; the suffix
  // itself is left as literal underscores (see DEDUP_SUFFIX_RE above).
  const decoded = decodeURIComponent(segment);
  const suffix = decoded.match(DEDUP_SUFFIX_RE);
  if (!suffix) {
    return decoded.replaceAll("_", " ");
  }
  const base = decoded.slice(0, suffix.index);
  return base.replaceAll("_", " ") + suffix[0];
}

export function cardTitleToSegment(title: string): string {
  return encodeUnsafeChars(title);
}

export function segmentToCardTitle(segment: string): string {
  return decodeUnsafeChars(segment);
}

// frontend/src/lib/slugify.ts
//
// Converts a card's title into the URL path segment used to display
// it (see routes/cards/CardForm.tsx and CardItem.tsx). This replaces
// the old persisted, server-disambiguated "slug" field entirely: since
// a card's title is already guaranteed unique within its pot (see the
// "cards" collection's (pot, title) unique index), the URL segment can
// simply be derived from that title on demand.
//
// The backend has its own mirror of the exact same algorithm (see
// internal/slug/slug.go) -- both must stay in lockstep, since the
// frontend builds a card's edit link from titleToSegment(title) and,
// for now, resolves that same URL back into a record by recomputing
// titleToSlug for every candidate card and comparing (see
// CardForm.tsx) -- there is currently no backend route that reverses a
// URL segment back into a record.

// Reserved segments that must never collide with a real card's slug,
// since they're claimed by a static route (see lib/router.tsx's
// "/:slug/new"). Mirrors internal/slug/slug.go's own `reserved` map.
const RESERVED_SEGMENTS = new Set(["new"]);

// Splits text on runs of "[", "]", and space, dropping empty entries.
// Brackets commonly show up in text imported from bracket-link wikis
// (e.g. "[some page]") and act as a word separator just like
// whitespace does.
function splitWords(text: string): string[] {
  return text.split(/[[\] ]+/).filter((word) => word !== "");
}

// Converts title into a URL-safe slug: any run of brackets/spaces --
// including at the edges -- collapses into a single "_". Non-ASCII
// characters (e.g. Japanese) are left as-is. A result that would
// collide with a reserved route segment gets a trailing underscore
// appended, deterministically, so this never needs a round-trip to
// the server to avoid that collision.
export function titleToSlug(title: string): string {
  const joined = splitWords(title).join("_");
  return RESERVED_SEGMENTS.has(joined) ? `${joined}_` : joined;
}

// Percent-encodes the characters that are actually unsafe in a path
// segment: % / # ?, plus any ASCII control character (e.g. a stray tab
// pasted into a title), which browsers can silently mangle or strip.
// Everything else, including non-ASCII text such as Japanese and the
// underscores titleToSlug already produces, is left as-is so it shows
// up literally in the browser instead of being percent-encoded the
// way encodeURIComponent would do it.
function encodeUnsafeChars(slug: string): string {
  return slug
    .replaceAll("%", "%25") // must run first, or the escapes below would be double-encoded
    .replaceAll("/", "%2F")
    .replaceAll("#", "%23")
    .replaceAll("?", "%3F")
    .replace(/[\x00-\x1f\x7f]/g, encodeControlChar);
}

// Percent-encodes a single ASCII control character (tab, newline, ...).
// Only ever called for characters the regex in encodeUnsafeChars
// matched, so printable non-ASCII text (Japanese, the full-width space
// U+3000, ...) never reaches this function.
function encodeControlChar(ch: string): string {
  return `%${ch.charCodeAt(0).toString(16).padStart(2, "0").toUpperCase()}`;
}

// Converts a card's title straight into the URL path segment used to
// link to it (see CardItem.tsx).
export function titleToSegment(title: string): string {
  return encodeUnsafeChars(titleToSlug(title));
}

// Decodes a URL path segment back into its raw slug form, so it can
// be compared against titleToSlug(card.title) for every candidate
// card in the pot (see CardForm.tsx).
export function segmentToSlug(segment: string): string {
  return decodeURIComponent(segment);
}

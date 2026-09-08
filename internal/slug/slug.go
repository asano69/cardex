// Package slug converts a card's title into a URL-safe path segment.
// This is a pure, stateless text transform with no database access:
// any given title always slugifies to the same string, on both the
// frontend and the backend. It replaces the old persisted, uniqueness-
// disambiguated "slug" field entirely -- with the (pot, title) index
// already guaranteeing a card's title is unique per pot, the URL
// segment can simply be derived from that title on demand instead of
// being stored and kept in sync.
//
// The frontend has its own mirror of this exact algorithm (see
// frontend/src/lib/slugify.ts), since a card's edit URL is built from
// its title on the frontend and, for now, resolved back into a record
// on the frontend too (see routes/cards/CardForm.tsx) -- there is
// currently no backend route that needs to reverse a URL segment back
// into a record. Both implementations must stay in lockstep; add a
// test here whenever slugify.ts's test suite gains one, and vice versa.
package slug

import "strings"

// reserved is the set of segments FromTitle must never produce, since
// they collide with a static route (see
// frontend/src/lib/router.tsx's "/:slug/new").
var reserved = map[string]bool{
	"new": true,
}

// splitWords splits s on runs of "[", "]", and space, dropping empty
// fields. Brackets commonly show up in text imported from
// bracket-link wikis (e.g. "[some page]") and act as a word separator
// just like whitespace does -- consecutive brackets/spaces collapse
// into a single separator either way, so "[a][b]" and "[a] [b]" both
// produce the word list ["a", "b"].
func splitWords(s string) []string {
	return strings.FieldsFunc(s, func(r rune) bool {
		return r == '[' || r == ']' || r == ' '
	})
}

// StripBracketLinks removes Scrapbox/Cosense-style bracket-link markup
// from a raw title candidate, returning its words rejoined with a
// single space -- e.g. "[A B[X]C D]" -> "A B X C D". Reuses the same
// separator class as FromTitle (brackets and spaces), so a title
// produced this way slugifies identically whether or not it still
// contains brackets. Returns "" when the candidate carries no words at
// all (e.g. "[[]]"); callers are responsible for applying their own
// empty-title fallback (see resolveTitle in internal/serve/slug.go).
//
// Unlike FromTitle, this does not collapse to a reserved-word suffix:
// it produces a display title, not a URL segment, so there is no
// route to collide with.
func StripBracketLinks(candidate string) string {
	return strings.Join(splitWords(candidate), " ")
}

// FromTitle converts a card's title into a URL-safe slug: any run of
// brackets/spaces -- including at the edges -- collapses into a
// single "_". Non-ASCII characters (e.g. Japanese) are left as-is;
// percent-encoding the handful of characters that are actually unsafe
// in a path segment (% / # ?) is the caller's job (see
// frontend/src/lib/slugify.ts's titleToSegment).
//
// A result that would collide with a reserved route segment (e.g.
// "new") gets a trailing underscore appended, deterministically, so
// FromTitle never needs a database round-trip to avoid that collision.
func FromTitle(title string) string {
	joined := strings.Join(splitWords(title), "_")
	if reserved[joined] {
		return joined + "_"
	}
	return joined
}

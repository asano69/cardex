// Package serve: slug.go resolves a URL-safe, unique "slug" for a card
// from arbitrary candidate text (the card's header, or its first body
// line if the header is empty). This is deliberately separate from
// ydoc.go's Yjs persistence hook: slug resolution reacts to an
// explicit client request (see the /api/admin/cards and
// /api/admin/cards/{id}/slug routes in cards.go), not to every Yjs
// update, so there's no need to detect whether the header actually
// changed before recomputing it.
package serve

import (
	"database/sql"
	"errors"
	"fmt"
	"regexp"
	"strings"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// reservedSlug can never be reached via URL: "/:slug/new" always opens
// the draft-creation flow (see frontend/src/lib/router.tsx), so a card
// whose derived slug is exactly this string is renamed with a trailing
// underscore before the usual uniqueness check runs.
const reservedSlug = "new"
const reservedSlugFallback = "new_"

// multiSpaceRe collapses runs of whitespace to a single space (see
// normalizeCandidateText below), so e.g. "a   b" and "a b" resolve to
// the same slug/title instead of leaving stray underscores or spaces.
var multiSpaceRe = regexp.MustCompile(`\s+`)

// bracketReplacer turns "[" and "]" in a candidate into a plain space.
// These commonly show up in text imported from bracket-link wikis
// (e.g. "[some page]") and would otherwise leak into the slug/title as
// stray punctuation instead of reading as a word separator.
var bracketReplacer = strings.NewReplacer("[", " ", "]", " ")

// normalizeCandidateText replaces "[" / "]" with a space, collapses
// any run of whitespace into a single space, and trims leading/
// trailing whitespace. This is the shared first step for both slug
// and title resolution (see normalizeSlugCandidate below and
// buildTitleAndPreview in ydoc.go) -- both start from the same raw
// header/paragraph text, so keeping this in one place is what lets
// them eventually collapse into a single field.
func normalizeCandidateText(s string) string {
	s = bracketReplacer.Replace(s)
	s = multiSpaceRe.ReplaceAllString(s, " ")
	return strings.TrimSpace(s)
}

// normalizeSlugCandidate normalizes candidate (see
// normalizeCandidateText), then replaces remaining spaces with
// underscores so the result is safe as a single URL path segment.
// Non-ASCII characters (e.g. Japanese) are left as-is --
// percent-encoding the handful of characters that are actually unsafe
// in a path segment (% / # ?) is the frontend's job (see
// frontend/src/lib/cardSlug.ts).
func normalizeSlugCandidate(candidate string) string {
	candidate = normalizeCandidateText(candidate)
	return strings.ReplaceAll(candidate, " ", "_")
}

// resolveUniqueInPot returns a value derived from base that is unique
// among "cards" records where `field` matches, scoped to pot.
// excludeID lets a record keep resolving against its own current value
// without colliding with itself (pass "" for a brand-new record).
// Collisions are disambiguated with a numeric suffix ("_2", "_3", ...),
// shared by resolveCardSlug and resolveCardTitle below since both
// fields are unique per-pot and use the same disambiguation scheme.
func resolveUniqueInPot(app core.App, pot, field, base, excludeID string) (string, error) {
	value := base
	for suffix := 2; ; suffix++ {
		_, err := app.FindFirstRecordByFilter(
			"cards",
			fmt.Sprintf("pot = {:pot} && %s = {:value} && id != {:id}", field),
			dbx.Params{"pot": pot, "value": value, "id": excludeID},
		)
		if errors.Is(err, sql.ErrNoRows) {
			return value, nil
		}
		if err != nil {
			return "", err
		}
		value = fmt.Sprintf("%s_%d", base, suffix)
	}
}

// resolveCardSlug returns a slug derived from candidate that is unique
// within pot. excludeID lets a record keep resolving against its own
// current slug without colliding with itself (pass "" for a brand-new
// record). Empty candidates fall back to defaultTitle (see ydoc.go),
// the same "Untitled" fallback used for a card with no derivable
// title.
func resolveCardSlug(app core.App, pot, candidate, excludeID string) (string, error) {
	base := normalizeSlugCandidate(candidate)
	if base == "" {
		base = defaultTitle
	}
	if base == reservedSlug {
		base = reservedSlugFallback
	}
	return resolveUniqueInPot(app, pot, "slug", base, excludeID)
}

// resolveCardTitle returns a title derived from rawTitle that is unique
// within pot, matching the "cards" collection's unique (pot, title)
// index. Unlike resolveCardSlug, spaces are kept as-is and there is no
// reserved-word fallback -- the title is a display label, not a URL
// segment. excludeID lets a card keep resolving against its own current
// title without colliding with itself.
func resolveCardTitle(app core.App, pot, rawTitle, excludeID string) (string, error) {
	if rawTitle == "" {
		rawTitle = defaultTitle
	}
	return resolveUniqueInPot(app, pot, "title", rawTitle, excludeID)
}

// mergeSuffixRe matches the trailing numeric dedup suffix a slug gets
// from resolveUniqueInPot (e.g. "p_2" -> "p"). Mirrors
// frontend/src/lib/cardSlug.ts's stripSlugSuffix; only one level is
// stripped per call.
var mergeSuffixRe = regexp.MustCompile(`^(.+)_\d+$`)

// stripSlugSuffix strips one level of the trailing numeric dedup
// suffix from slug (see mergeSuffixRe), or returns "" if slug has no
// such suffix.
func stripSlugSuffix(slug string) string {
	m := mergeSuffixRe.FindStringSubmatch(slug)
	if m == nil {
		return ""
	}
	return m[1]
}

// findMergeTarget returns the slug this card would collide with if its
// own numeric dedup suffix were stripped (e.g. "p_2" -> "p"), but only
// when that collision looks like a genuine duplicate rather than two
// deliberately different headers that happen to share a stripped slug:
// the other card's own header (its card_lines position-0 line) must
// match rawHeader once both are trimmed. Returns "" when no merge
// alert should be shown.
func findMergeTarget(app core.App, pot, slug, rawHeader, excludeID string) (string, error) {
	stripped := stripSlugSuffix(slug)
	if stripped == "" {
		return "", nil
	}

	other, err := app.FindFirstRecordByFilter(
		"cards",
		"pot = {:pot} && slug = {:slug} && id != {:id}",
		dbx.Params{"pot": pot, "slug": stripped, "id": excludeID},
	)
	if errors.Is(err, sql.ErrNoRows) {
		return "", nil
	}
	if err != nil {
		return "", err
	}

	otherHeader, err := firstLineContent(app, other.Id)
	if err != nil {
		return "", err
	}

	if !headersMatch(rawHeader, otherHeader) {
		return "", nil
	}
	return stripped, nil
}

// headersMatch reports whether two card headers should be treated as
// the same title for merge-alert purposes: exact match once both are
// trimmed of leading/trailing whitespace. strings.TrimSpace already
// strips the full-width space (U+3000) commonly typed in Japanese
// text, via Go's Unicode White_Space table, so no extra normalization
// is needed here.
func headersMatch(a, b string) bool {
	return strings.TrimSpace(a) == strings.TrimSpace(b)
}

// firstLineContent returns the content of a card's first line (see
// lines.go's textblockTags), which is always its header -- or "" if
// the card has no lines yet.
func firstLineContent(app core.App, cardID string) (string, error) {
	record, err := app.FindFirstRecordByFilter(
		"card_lines",
		"card = {:card} && position = 0",
		dbx.Params{"card": cardID},
	)
	if errors.Is(err, sql.ErrNoRows) {
		return "", nil
	}
	if err != nil {
		return "", err
	}
	return record.GetString("content"), nil
}

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

// multiSpaceRe collapses runs of whitespace to a single space before
// the space-to-underscore normalization below, so e.g. "a   b" and
// "a b" resolve to the same slug instead of leaving stray underscores.
var multiSpaceRe = regexp.MustCompile(`\s+`)

// normalizeSlugCandidate trims and collapses whitespace, then replaces
// remaining spaces with underscores so the result is safe as a single
// URL path segment. Non-ASCII characters (e.g. Japanese) are left
// as-is -- percent-encoding the handful of characters that are
// actually unsafe in a path segment (% / # ?) is the frontend's job
// (see frontend/src/lib/cardSlug.ts).
func normalizeSlugCandidate(candidate string) string {
	candidate = strings.TrimSpace(candidate)
	candidate = multiSpaceRe.ReplaceAllString(candidate, " ")
	return strings.ReplaceAll(candidate, " ", "_")
}

// resolveUniqueInIssue returns a value derived from base that is unique
// among "cards" records where `field` matches, scoped to issue.
// excludeID lets a record keep resolving against its own current value
// without colliding with itself (pass "" for a brand-new record).
// Collisions are disambiguated with a numeric suffix ("_2", "_3", ...),
// shared by resolveCardSlug and resolveCardTitle below since both
// fields are unique per-issue and use the same disambiguation scheme.
func resolveUniqueInIssue(app core.App, issue, field, base, excludeID string) (string, error) {
	value := base
	for suffix := 2; ; suffix++ {
		_, err := app.FindFirstRecordByFilter(
			"cards",
			fmt.Sprintf("issue = {:issue} && %s = {:value} && id != {:id}", field),
			dbx.Params{"issue": issue, "value": value, "id": excludeID},
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
// within issue. excludeID lets a record keep resolving against its own
// current slug without colliding with itself (pass "" for a brand-new
// record). Empty candidates fall back to defaultTitle (see ydoc.go),
// the same "Untitled" fallback used for a card with no derivable
// title.
func resolveCardSlug(app core.App, issue, candidate, excludeID string) (string, error) {
	base := normalizeSlugCandidate(candidate)
	if base == "" {
		base = defaultTitle
	}
	if base == reservedSlug {
		base = reservedSlugFallback
	}
	return resolveUniqueInIssue(app, issue, "slug", base, excludeID)
}

// resolveCardTitle returns a title derived from rawTitle that is unique
// within issue, matching the "cards" collection's unique (issue, title)
// index. Unlike resolveCardSlug, spaces are kept as-is and there is no
// reserved-word fallback -- the title is a display label, not a URL
// segment. excludeID lets a card keep resolving against its own current
// title without colliding with itself.
func resolveCardTitle(app core.App, issue, rawTitle, excludeID string) (string, error) {
	if rawTitle == "" {
		rawTitle = defaultTitle
	}
	return resolveUniqueInIssue(app, issue, "title", rawTitle, excludeID)
}

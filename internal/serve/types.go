// Package serve: types.go defines the string-based domain types shared
// across slug.go, cards.go, and ydoc.go, so a candidate string, a
// resolved slug, and a resolved title can never be passed to each
// other's functions by mistake even though all three are just text
// underneath.
package serve

// TitleCandidate is raw, unresolved text extracted from a card's live
// document -- its header, or its first body line if the header is
// empty (see slugCandidatePlugin.ts on the frontend, and
// buildTitleAndPreview in ydoc.go on the backend) -- before it has
// been normalized and disambiguated into a CardSlug or CardTitle.
type TitleCandidate string

// CardSlug is a card's URL-safe slug, unique within a pot (see the
// "cards" collection's (pot, slug) unique index). Resolved from a
// TitleCandidate via resolveCardSlug.
type CardSlug string

// CardTitle is a card's display title, unique within a pot (see the
// "cards" collection's (pot, title) unique index). Resolved from a
// TitleCandidate via resolveCardTitle. There is no backend equivalent
// of the frontend's CardGridTitle -- the grid-specific title is a
// presentation concern the frontend derives on its own.
type CardTitle string

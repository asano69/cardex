// cards.go implements the custom API routes a client uses to resolve
// a card's slug: one for brand-new drafts (which need a real record id
// before Yjs sync can start) and one for renaming an existing card.
// Kept as dedicated routes rather than a collection before-save hook,
// so being called at all already means "the client wants this slug
// candidate tried" -- no separate change-detection logic is needed to
// tell a real title edit apart from an unrelated save (pin toggle,
// position update, ...).
package serve

import (
	"fmt"
	"net/http"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// positionStep matches the frontend's own POSITION_STEP (see
// frontend/src/lib/position.ts): a new card starts POSITION_STEP past
// its pot's current highest position, so it sorts first in
// CardList's descending grid without needing a full renumber later.
const positionStep = 1000

// maxSlugRetries bounds how many times a create/update retries after a
// database-level unique constraint violation on (pot, slug) -- the
// final defense against a TOCTOU race between resolveCardSlug's
// existence check and the actual save (see slug.go).
const maxSlugRetries = 3

type createCardRequest struct {
	Pot           string         `json:"pot"`
	SlugCandidate TitleCandidate `json:"slugCandidate"`
}

type updateCardSlugRequest struct {
	SlugCandidate TitleCandidate `json:"slugCandidate"`
}

// nextCardPosition returns the position for a new card in `pot`.
func nextCardPosition(app core.App, pot string) (float64, error) {
	records, err := app.FindRecordsByFilter(
		"cards", "pot = {:pot}", "-position", 1, 0,
		dbx.Params{"pot": pot},
	)
	if err != nil {
		return 0, err
	}
	if len(records) == 0 {
		return positionStep, nil
	}
	return records[0].GetFloat("position") + positionStep, nil
}

// createCardHandler creates a new "cards" record with a slug and title
// resolved from the client-supplied candidate (falling back to
// "Untitled" when the candidate is empty -- see resolveCardSlug/
// resolveCardTitle). Used by the note editor's draft mode (see
// frontend/src/components/noteEditor/index.tsx), which needs a real
// record id before Yjs sync can start.
func createCardHandler(e *core.RequestEvent) error {
	var req createCardRequest
	if err := e.BindBody(&req); err != nil {
		return e.BadRequestError("invalid request body", err)
	}
	if req.Pot == "" {
		return e.BadRequestError("pot is required", nil)
	}

	collection, err := e.App.FindCollectionByNameOrId("cards")
	if err != nil {
		return e.InternalServerError("load cards collection", err)
	}

	position, err := nextCardPosition(e.App, req.Pot)
	if err != nil {
		return e.InternalServerError("compute card position", err)
	}

	candidate := req.SlugCandidate
	for attempt := 0; attempt < maxSlugRetries; attempt++ {
		slug, title, err := resolveSlugAndTitle(e.App, req.Pot, candidate, "")
		if err != nil {
			return e.InternalServerError("resolve slug/title", err)
		}

		record := core.NewRecord(collection)
		record.Set("pot", req.Pot)
		record.Set("slug", string(slug))
		record.Set("title", string(title))
		record.Set("position", position)
		if err := e.App.Save(record); err != nil {
			if attempt < maxSlugRetries-1 {
				// A concurrent request may have taken this slug between
				// resolveCardSlug's check and this save (TOCTOU) -- bump
				// the candidate and retry rather than failing outright.
				candidate = TitleCandidate(fmt.Sprintf("%s_%d", req.SlugCandidate, attempt+2))
				continue
			}
			return e.InternalServerError("save card", err)
		}
		return jsonWithMergeTarget(e, e.App, req.Pot, slug, req.SlugCandidate, "", record)
	}
	return e.InternalServerError("failed to create card after retries", nil)
}

// updateCardSlugHandler resolves a new slug AND title for an existing
// card from the client-supplied candidate (see slug.go's
// resolveSlugAndTitle). This is now the single place a card's title
// changes -- it no longer depends on ygo's periodic Yjs snapshot
// timing (see ydoc.go's updatePreview, which now only touches
// "description").
func updateCardSlugHandler(e *core.RequestEvent) error {
	id := e.Request.PathValue("id")

	var req updateCardSlugRequest
	if err := e.BindBody(&req); err != nil {
		return e.BadRequestError("invalid request body", err)
	}
	if req.SlugCandidate == "" {
		return e.BadRequestError("slugCandidate is required", nil)
	}

	record, err := e.App.FindRecordById("cards", id)
	if err != nil {
		return e.NotFoundError("card not found", err)
	}
	pot := record.GetString("pot")

	candidate := req.SlugCandidate
	for attempt := 0; attempt < maxSlugRetries; attempt++ {
		slug, title, err := resolveSlugAndTitle(e.App, pot, candidate, id)
		if err != nil {
			return e.InternalServerError("resolve slug/title", err)
		}

		record.Set("slug", string(slug))
		record.Set("title", string(title))
		if err := e.App.Save(record); err != nil {
			if attempt < maxSlugRetries-1 {
				candidate = TitleCandidate(fmt.Sprintf("%s_%d", req.SlugCandidate, attempt+2))
				continue
			}
			return e.InternalServerError("save card", err)
		}
		return jsonWithMergeTarget(e, e.App, pot, slug, req.SlugCandidate, id, record)
	}
	return e.InternalServerError("failed to update slug after retries", nil)
}

// jsonWithMergeTarget writes record as JSON alongside a "mergeTarget"
// field: the slug of another card in the same pot whose header text
// this save's header appears to duplicate (see findMergeTarget in
// slug.go), or null when there's no such duplicate.
func jsonWithMergeTarget(e *core.RequestEvent, app core.App, pot string, slug CardSlug, rawHeader TitleCandidate, excludeID string, record *core.Record) error {
	mergeTarget, err := findMergeTarget(app, pot, slug, rawHeader, excludeID)
	if err != nil {
		return e.InternalServerError("find merge target", err)
	}
	var target any
	if mergeTarget != "" {
		target = string(mergeTarget)
	}
	return e.JSON(http.StatusOK, map[string]any{
		"card":        record,
		"mergeTarget": target,
	})
}

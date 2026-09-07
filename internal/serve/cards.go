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
// its issue's current highest position, so it sorts first in
// CardList's descending grid without needing a full renumber later.
const positionStep = 1000

// maxSlugRetries bounds how many times a create/update retries after a
// database-level unique constraint violation on (issue, slug) -- the
// final defense against a TOCTOU race between resolveCardSlug's
// existence check and the actual save (see slug.go).
const maxSlugRetries = 3

type createCardRequest struct {
	Issue         string `json:"issue"`
	SlugCandidate string `json:"slugCandidate"`
}

type updateCardSlugRequest struct {
	SlugCandidate string `json:"slugCandidate"`
}

// nextCardPosition returns the position for a new card in `issue`.
func nextCardPosition(app core.App, issue string) (float64, error) {
	records, err := app.FindRecordsByFilter(
		"cards", "issue = {:issue}", "-position", 1, 0,
		dbx.Params{"issue": issue},
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
	if req.Issue == "" {
		return e.BadRequestError("issue is required", nil)
	}

	collection, err := e.App.FindCollectionByNameOrId("cards")
	if err != nil {
		return e.InternalServerError("load cards collection", err)
	}

	position, err := nextCardPosition(e.App, req.Issue)
	if err != nil {
		return e.InternalServerError("compute card position", err)
	}

	candidate := req.SlugCandidate
	for attempt := 0; attempt < maxSlugRetries; attempt++ {
		slug, err := resolveCardSlug(e.App, req.Issue, candidate, "")
		if err != nil {
			return e.InternalServerError("resolve slug", err)
		}
		// A card that never got any header text (e.g. an empty draft
		// confirmed with Enter) would otherwise sit with no title at
		// all until its first real edit -- resolve it here too, using
		// the same "Untitled" fallback and per-issue disambiguation as
		// the slug above. Any later edit still overwrites this via
		// ydoc.go's updateTitleAndPreview.
		title, err := resolveCardTitle(e.App, req.Issue, req.SlugCandidate, "")
		if err != nil {
			return e.InternalServerError("resolve title", err)
		}

		record := core.NewRecord(collection)
		record.Set("issue", req.Issue)
		record.Set("slug", slug)
		record.Set("title", title)
		record.Set("position", position)
		if err := e.App.Save(record); err != nil {
			if attempt < maxSlugRetries-1 {
				// A concurrent request may have taken this slug between
				// resolveCardSlug's check and this save (TOCTOU) -- bump
				// the candidate and retry rather than failing outright.
				candidate = fmt.Sprintf("%s_%d", req.SlugCandidate, attempt+2)
				continue
			}
			return e.InternalServerError("save card", err)
		}
		return jsonWithMergeTarget(e, e.App, req.Issue, slug, req.SlugCandidate, "", record)
	}
	return e.InternalServerError("failed to create card after retries", nil)
}

// updateCardSlugHandler resolves a new slug for an existing card from
// the client-supplied candidate. Only the slug changes here -- title
// and description stay derived from the card's live Yjs content (see
// ydoc.go's updateTitleAndPreview).
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
	issue := record.GetString("issue")

	candidate := req.SlugCandidate
	for attempt := 0; attempt < maxSlugRetries; attempt++ {
		slug, err := resolveCardSlug(e.App, issue, candidate, id)
		if err != nil {
			return e.InternalServerError("resolve slug", err)
		}

		record.Set("slug", slug)
		if err := e.App.Save(record); err != nil {
			if attempt < maxSlugRetries-1 {
				candidate = fmt.Sprintf("%s_%d", req.SlugCandidate, attempt+2)
				continue
			}
			return e.InternalServerError("save card", err)
		}
		return jsonWithMergeTarget(e, e.App, issue, slug, req.SlugCandidate, id, record)
	}
	return e.InternalServerError("failed to update slug after retries", nil)
}

// jsonWithMergeTarget writes record as JSON alongside a "mergeTarget"
// field: the slug of another card in the same issue whose header text
// this save's header appears to duplicate (see findMergeTarget in
// slug.go), or null when there's no such duplicate.
func jsonWithMergeTarget(e *core.RequestEvent, app core.App, issue, slug, rawHeader, excludeID string, record *core.Record) error {
	mergeTarget, err := findMergeTarget(app, issue, slug, rawHeader, excludeID)
	if err != nil {
		return e.InternalServerError("find merge target", err)
	}
	var target any
	if mergeTarget != "" {
		target = mergeTarget
	}
	return e.JSON(http.StatusOK, map[string]any{
		"card":        record,
		"mergeTarget": target,
	})
}

// cards.go implements the custom API routes a client uses to resolve
// a card's title: one for brand-new drafts (which need a real record
// id before Yjs sync can start) and one for renaming an existing
// card's title. Kept as dedicated routes rather than a collection
// before-save hook, so being called at all already means "the client
// wants this title candidate tried" -- no separate change-detection
// logic is needed to tell a real title edit apart from an unrelated
// save (pin toggle, position update, ...). A card's URL segment is not
// a separate field resolved here -- it's derived from the title on
// demand (see internal/slug.FromTitle and lib/slugify.ts).
package serve

import (
	"database/sql"
	"errors"
	"fmt"
	"net/http"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"

	"github.com/asano69/cardpot/internal/slug"
)

// positionStep matches the frontend's own POSITION_STEP (see
// frontend/src/lib/position.ts): a new card starts POSITION_STEP past
// its pot's current highest position, so it sorts first in
// CardList's descending grid without needing a full renumber later.
const positionStep = 1000

// maxTitleRetries bounds how many times a create/update retries after
// a database-level unique constraint violation on (pot, title) -- the
// final defense against a TOCTOU race between resolveTitle's existence
// check and the actual save (see slug.go).
const maxTitleRetries = 3

type createCardRequest struct {
	Pot            string         `json:"pot"`
	TitleCandidate TitleCandidate `json:"titleCandidate"`
}

type updateCardTitleRequest struct {
	TitleCandidate TitleCandidate `json:"titleCandidate"`
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

// createCardHandler creates a new "cards" record with a title resolved
// from the client-supplied candidate (falling back to "Untitled" when
// the candidate is empty -- see resolveTitle). Used by the note
// editor's draft mode (see
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

	candidate := req.TitleCandidate
	for attempt := 0; attempt < maxTitleRetries; attempt++ {
		title, err := resolveTitle(e.App, req.Pot, candidate, "")
		if err != nil {
			return e.InternalServerError("resolve title", err)
		}

		record := core.NewRecord(collection)
		record.Set("pot", req.Pot)
		record.Set("title", string(title))
		// Derived straight from title (see internal/slug.FromTitle) and
		// stored so the (pot, slug) unique index -- not (pot, title) --
		// is what actually enforces one card per URL segment (see
		// resolveUniqueTitleInPot's own comment on why title alone
		// can't guard against this).
		record.Set("slug", slug.FromTitle(string(title)))
		record.Set("position", position)
		if err := e.App.Save(record); err != nil {
			if attempt < maxTitleRetries-1 {
				// A concurrent request may have taken this title between
				// resolveTitle's check and this save (TOCTOU) -- bump
				// the candidate and retry rather than failing outright.
				candidate = TitleCandidate(fmt.Sprintf("%s_%d", req.TitleCandidate, attempt+2))
				continue
			}
			return e.InternalServerError("save card", err)
		}
		return jsonWithMergeTarget(e, e.App, req.Pot, title, req.TitleCandidate, "", record)
	}
	return e.InternalServerError("failed to create card after retries", nil)
}

// updateCardTitleHandler resolves a new title for an existing card
// from the client-supplied candidate (see slug.go's resolveTitle).
// This is the single place a card's title changes -- it no longer
// depends on ygo's periodic Yjs snapshot timing (see ydoc.go's
// updatePreview, which only touches "description").
func updateCardTitleHandler(e *core.RequestEvent) error {
	id := e.Request.PathValue("id")

	var req updateCardTitleRequest
	if err := e.BindBody(&req); err != nil {
		return e.BadRequestError("invalid request body", err)
	}
	if req.TitleCandidate == "" {
		return e.BadRequestError("titleCandidate is required", nil)
	}

	record, err := e.App.FindRecordById("cards", id)
	if err != nil {
		return e.NotFoundError("card not found", err)
	}
	pot := record.GetString("pot")

	candidate := req.TitleCandidate
	for attempt := 0; attempt < maxTitleRetries; attempt++ {
		title, err := resolveTitle(e.App, pot, candidate, id)
		if err != nil {
			return e.InternalServerError("resolve title", err)
		}

		record.Set("title", string(title))
		// See createCardHandler's own comment: slug is the actual
		// uniqueness boundary the DB index enforces.
		record.Set("slug", slug.FromTitle(string(title)))
		if err := e.App.Save(record); err != nil {
			if attempt < maxTitleRetries-1 {
				candidate = TitleCandidate(fmt.Sprintf("%s_%d", req.TitleCandidate, attempt+2))
				continue
			}
			return e.InternalServerError("save card", err)
		}
		return jsonWithMergeTarget(e, e.App, pot, title, req.TitleCandidate, id, record)
	}
	return e.InternalServerError("failed to update title after retries", nil)
}

// findCardBySlugHandler resolves a card by its stored "slug" field
// (see internal/slug.FromTitle, computed once at save time by
// createCardHandler/updateCardTitleHandler -- not recomputed here),
// via a direct (pot, slug) filter backed by that pair's own unique
// index (see resolveUniqueTitleInPot's comment on why slug, not
// title, is the real uniqueness boundary).
func findCardBySlugHandler(e *core.RequestEvent) error {
	potID := e.Request.PathValue("potId")
	targetSlug := e.Request.PathValue("slug")

	record, err := e.App.FindFirstRecordByFilter(
		"cards", "pot = {:pot} && slug = {:slug}",
		dbx.Params{"pot": potID, "slug": targetSlug},
	)
	if errors.Is(err, sql.ErrNoRows) {
		return e.NotFoundError("card not found", nil)
	}
	if err != nil {
		return e.InternalServerError("find card", err)
	}
	return e.JSON(http.StatusOK, record)
}

// jsonWithMergeTarget writes record as JSON alongside a "mergeTarget"
// field: the title of another card in the same pot whose header text
// this save's header appears to duplicate (see findMergeTarget in
// slug.go), or null when there's no such duplicate.
func jsonWithMergeTarget(e *core.RequestEvent, app core.App, pot string, title CardTitle, rawHeader TitleCandidate, excludeID string, record *core.Record) error {
	mergeTarget, err := findMergeTarget(app, pot, title, rawHeader, excludeID)
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

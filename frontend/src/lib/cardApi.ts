import pb from "./pb";
import type { CardRecord } from "../routes/cards/CardForm";

// Creates a new "cards" record with a slug resolved server-side from
// `slugCandidate` (see internal/serve/cards.go's createCardHandler).
// Used by NoteEditor's draft mode, which needs a real record id before
// Yjs sync can start.
export async function createCard(
  issue: string,
  slugCandidate: string,
): Promise<CardRecord> {
  return await pb.send<CardRecord>("/api/admin/cards", {
    method: "POST",
    body: { issue, slugCandidate },
  });
}

// Resolves and saves a new slug for an existing card (see
// internal/serve/cards.go's updateCardSlugHandler). Only the slug
// changes here -- title and description stay derived from the card's live
// Yjs content (see internal/serve/ydoc.go).
export async function updateCardSlug(
  cardId: string,
  slugCandidate: string,
): Promise<CardRecord> {
  return await pb.send<CardRecord>(`/api/admin/cards/${cardId}/slug`, {
    method: "POST",
    body: { slugCandidate },
  });
}

import pb from "./pb";
import type { CardRecord } from "../routes/cards/CardForm";

// Response shape shared by createCard/updateCardSlug: the saved card,
// plus a merge-alert target computed server-side (see findMergeTarget
// in internal/serve/slug.go) -- the slug of another card in the same
// issue whose header this one's header appears to duplicate, or null.
export interface CardMutationResult {
  card: CardRecord;
  mergeTarget: string | null;
}

// Creates a new "cards" record with a slug resolved server-side from
// `slugCandidate` (see internal/serve/cards.go's createCardHandler).
// Used by NoteEditor's draft mode, which needs a real record id before
// Yjs sync can start.
export async function createCard(
  issue: string,
  slugCandidate: string,
): Promise<CardMutationResult> {
  return await pb.send<CardMutationResult>("/api/admin/cards", {
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
): Promise<CardMutationResult> {
  return await pb.send<CardMutationResult>(`/api/admin/cards/${cardId}/slug`, {
    method: "POST",
    body: { slugCandidate },
  });
}

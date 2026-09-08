import pb from "./pb";
import type { CardRecord } from "../routes/cards/CardForm";
import type { TitleCandidate } from "./titleCandidate";

// Response shape shared by createCard/updateCardTitle: the saved card,
// plus a merge-alert target computed server-side (see findMergeTarget
// in internal/serve/slug.go) -- the title of another card in the same
// pot whose header this one's header appears to duplicate, or null.
export interface CardMutationResult {
  card: CardRecord;
  mergeTarget: string | null;
}

// Creates a new "cards" record with a title resolved server-side from
// `titleCandidate` (see internal/serve/cards.go's createCardHandler).
// Used by NoteEditor's draft mode, which needs a real record id before
// Yjs sync can start.
export async function createCard(
  pot: string,
  titleCandidate: TitleCandidate,
): Promise<CardMutationResult> {
  return await pb.send<CardMutationResult>("/api/admin/cards", {
    method: "POST",
    body: { pot, titleCandidate },
  });
}

// Resolves and saves a new title for an existing card (see
// internal/serve/cards.go's updateCardTitleHandler). The card's URL
// segment is derived from this same title on demand (see
// lib/slugify.ts) instead of being a separate field kept in sync here.
export async function updateCardTitle(
  cardId: string,
  titleCandidate: TitleCandidate,
): Promise<CardMutationResult> {
  return await pb.send<CardMutationResult>(`/api/admin/cards/${cardId}/title`, {
    method: "POST",
    body: { titleCandidate },
  });
}

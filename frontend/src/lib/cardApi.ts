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
// Resolves a card by its URL slug within pot (see
// internal/serve/cards.go's findCardBySlugHandler). Replaces
// CardForm's old approach of fetching every card in the pot and
// recomputing titleToSlug client-side.
export async function fetchCardBySlug(
  potId: string,
  slug: string,
): Promise<CardRecord> {
  return await pb.send<CardRecord>(
    `/api/admin/pots/${potId}/cards/by-slug/${encodeURIComponent(slug)}`,
    { method: "GET" },
  );
}

export async function updateCardTitle(
  cardId: string,
  titleCandidate: TitleCandidate,
): Promise<CardMutationResult> {
  return await pb.send<CardMutationResult>(`/api/admin/cards/${cardId}/title`, {
    method: "POST",
    body: { titleCandidate },
  });
}

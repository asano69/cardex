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
// Resolves a card by its URL slug within pot. "slug" is now a real,
// indexed "cards" column (see internal/serve/cards.go, which writes
// it alongside "title" on every save), so this is a direct
// (pot, slug) filter through PocketBase's standard collection API --
// same pattern as lib/pots.ts's fetchPotBySlug -- instead of a
// dedicated backend route doing its own server-side scan.
export async function fetchCardBySlug(
  potId: string,
  slug: string,
): Promise<CardRecord> {
  return await pb
    .collection("cards")
    .getFirstListItem<CardRecord>(
      pb.filter("pot = {:pot} && slug = {:slug}", { pot: potId, slug }),
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

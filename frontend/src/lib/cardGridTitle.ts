import type { CardRecord } from "../routes/cards/CardForm";

// The title shown for a card in CardList's grid (see CardItem.tsx).
// Branded so call sites can't accidentally show a card's slug or its
// genuine CardTitle directly where the grid-specific title is expected.
export type CardGridTitle = string & { readonly __brand: "CardGridTitle" };

// Derives the grid title for `card`. For now this is just the card's
// slug -- TODO: derive from the card's genuine CardTitle (card.title)
// instead once the grid is ready to show it.
export function deriveCardGridTitle(card: CardRecord): CardGridTitle {
  return card.slug as CardGridTitle;
}

import type { CardRecord } from "../routes/cards/CardForm";

// The title shown for a card in CardList's grid (see CardItem.tsx).
// Branded so call sites can't accidentally pass a card's genuine
// CardTitle directly where the grid-specific title is expected, in
// case grid-specific formatting (e.g. truncation) is ever added here.
export type CardGridTitle = string & { readonly __brand: "CardGridTitle" };

// Derives the grid title for `card`. Currently just the card's own
// title, wrapped in the branded type above.
export function deriveCardGridTitle(card: CardRecord): CardGridTitle {
  return card.title as CardGridTitle;
}

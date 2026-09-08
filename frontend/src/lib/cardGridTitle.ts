import type { CardRecord } from "../routes/cards/CardForm";

// The title shown for a card in CardList's grid (see CardItem.tsx).
// Branded so call sites can't accidentally pass a card's genuine
// CardTitle directly where the grid-specific title is expected, in
// case grid-specific formatting (e.g. truncation) is ever added here.
export type CardGridTitle = string & { readonly __brand: "CardGridTitle" };

// Matches a run of one or more ASCII whitespace characters (space,
// tab, newline, ...). Deliberately NOT the same as JS's `\s`, which
// also matches Unicode space separators like the full-width space
// (U+3000) -- that's a distinct, intentional character in Japanese
// text, not whitespace noise to collapse away.
const ASCII_WHITESPACE_RUN_RE = /[ \t\n\r\f\v]+/g;

// Collapses any run of ASCII whitespace in `title` into a single
// half-width space. resolveTitle (internal/serve/slug.go) only strips
// bracket markup from a candidate before saving it as a title -- a
// stray tab or doubled space typed by the user can still end up
// stored verbatim -- so this is what keeps the grid showing one clean
// gap instead of a visible double space or literal tab character.
export function collapseGridTitleWhitespace(title: string): string {
  return title.replace(ASCII_WHITESPACE_RUN_RE, " ");
}

// Derives the grid title for `card`: its stored title with ASCII
// whitespace runs collapsed (see collapseGridTitleWhitespace above).
export function deriveCardGridTitle(card: CardRecord): CardGridTitle {
  return collapseGridTitleWhitespace(card.title) as CardGridTitle;
}

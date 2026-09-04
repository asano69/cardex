import { A } from "@solidjs/router";
import type { CardRecord } from "./CardForm";

export interface CardItemProps {
  card: CardRecord;
}

// A single card in ThemeDetail's card grid, styled to match Cosense's
// own page-list card (see .card-grid-item in styles/components.css).
// white-space: pre-line on .description means the raw content string
// can be rendered as-is -- no need to split it into lines ourselves.
export default function CardItem(props: CardItemProps) {
  return (
    // The <li> carries the grid item's aspect-ratio; the whole card
    // links to its edit page (CardForm doubles as both the create and
    // edit form) instead of only some inner element, so clicking
    // anywhere on the card opens it.
    <li class="card-grid-item">
      <A href={`/themes/${props.card.theme}/cards/${props.card.id}`}>
        <div class="content">
          <div class="header">
            <h3 class="title">{props.card.title}</h3>
          </div>
          <div class="description">{props.card.content}</div>
        </div>
      </A>
    </li>
  );
}

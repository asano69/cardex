import { A } from "@solidjs/router";
import type { CardRecord } from "./CardForm";

export interface CardItemProps {
  card: CardRecord;
}

// A single card in IssueDetail's card grid, styled to match Cosense's
// own page-list card (see .card-grid-item in styles/components.css).
// Both the title and the preview text are precomputed server-side (see
// internal/serve/ydoc.go's buildTitleAndPreview) from the card's live
// Yjs body, not parsed here.
export default function CardItem(props: CardItemProps) {
  return (
    // The <li> carries the grid item's aspect-ratio; the whole card
    // links to its edit page (CardForm doubles as both the create and
    // edit form) instead of only some inner element, so clicking
    // anywhere on the card opens it.
    <li class="card-grid-item">
      <A href={`/issues/${props.card.issue}/cards/${props.card.id}`}>
        <div class="content">
          <div class="header">
            {/* Falls back to "Untitled" for a brand-new, still-empty
                card: the title is derived server-side from the first
                line of the card's body (see internal/serve/ydoc.go),
                so it stays blank until something is typed. */}
            <h3 class="title">{props.card.title || "Untitled"}</h3>
          </div>
          <div class="description">{props.card.preview}</div>
        </div>
      </A>
    </li>
  );
}

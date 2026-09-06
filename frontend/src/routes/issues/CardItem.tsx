import { A } from "@solidjs/router";
import { useSortable } from "@dnd-kit/solid/sortable";
import type { CardRecord } from "./CardForm";

export interface CardItemProps {
  card: CardRecord;
  // This card's position in the currently rendered grid order. Fed to
  // useSortable below so dnd-kit can report initialIndex/index on drop
  // (see IssueDetail.tsx's handleDragEnd).
  index: number;
}

// A single card in IssueDetail's card grid, styled to match Cosense's
// own page-list card (see .card-grid-item in styles/components.css).
// Both the title and the preview text are precomputed server-side (see
// internal/serve/ydoc.go's buildTitleAndPreview) from the card's live
// Yjs body, not parsed here.
export default function CardItem(props: CardItemProps) {
  // Makes this card draggable and a drop target within the grid.
  // Getter syntax (not a plain destructure) is required so the hook
  // re-reads id/index reactively instead of only once at setup -- see
  // dnd-kit's Solid docs.
  const { ref, isDragging } = useSortable({
    get id() {
      return props.card.id;
    },
    get index() {
      return props.index;
    },
  });

  return (
    // The <li> carries the grid item's aspect-ratio; the whole card
    // links to its edit page (CardForm doubles as both the create and
    // edit form) instead of only some inner element, so clicking
    // anywhere on the card opens it.
    <li
      ref={ref}
      class="card-grid-item"
      classList={{ "opacity-40": isDragging() }}
    >
      <A href={`/issues/${props.card.issue}/cards/${props.card.id}`}>
        <div class="content">
          <div class="header">
            <h3 class="title">{props.card.title}</h3>
          </div>
          <div class="description">{props.card.preview}</div>
        </div>
      </A>
    </li>
  );
}

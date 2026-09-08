import { onCleanup, Show } from "solid-js";
import { A } from "@solidjs/router";
import { useSortable } from "@dnd-kit/solid/sortable";
import { registerCardElement } from "../../lib/cardsStore";
import { titleToSegment } from "../../lib/slugify";
import { deriveCardGridTitle } from "../../lib/cardGridTitle";
import type { CardRecord } from "./CardForm";

export interface CardItemProps {
  card: CardRecord;
  // This card's position in the currently rendered grid order. Fed to
  // useSortable below so dnd-kit can report initialIndex/index on drop
  // (see CardList.tsx's handleDragEnd).
  index: number;
  // The parent pot's slug, used to build this card's URL (see
  // lib/cardSlug.ts). Cards only store their parent pot's
  // PocketBase id (see CardRecord's "pot" field), not its slug, so
  // the slug is passed down from CardList instead.
  potSlug: string;
}

// A single card in CardList's card grid, styled to match Cosense's
// own page-list card (see .card-grid-item in styles/components.css).
// Both the title and the description text are precomputed server-side (see
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

  // Registers this card's element so a reorder -- local or from
  // another user -- can animate it into its new grid slot instead of
  // snapping there instantly (see withCardsFlip in lib/cardFlip.ts).
  const setRef = (el: HTMLLIElement) => {
    ref(el);
    onCleanup(registerCardElement(props.card.id, el));
  };

  return (
    // The <li> carries the grid item's aspect-ratio; the whole card
    // links to its edit page (CardForm doubles as both the create and
    // edit form) instead of only some inner element, so clicking
    // anywhere on the card opens it.
    <li
      ref={setRef}
      class="card-grid-item"
      classList={{ "opacity-40": isDragging() }}
    >
      <A href={`/${props.potSlug}/${titleToSegment(props.card.title)}`}>
        {/* Folded-corner indicator for pinned cards (see
            styles/components.css's .card-grid-item .pin). */}
        <Show when={props.card.pin}>
          <div class="pin" aria-hidden="true" />
        </Show>
        <div class="content">
          <div class="header">
            <h3 class="title">{deriveCardGridTitle(props.card)}</h3>
          </div>
          {/* If the document has an image (see internal/xmldoc's
              FirstImageSrc, mirrored into the "image" field by
              internal/serve/ydoc.go), show it as a cover thumbnail
              instead of the plain-text description -- there's rarely
              room for both in a card this small. */}
          <Show
            when={props.card.image}
            fallback={<div class="description">{props.card.description}</div>}
          >
            <div
              class="thumbnail m-1.5"
              style={{ "background-image": `url(${props.card.image})` }}
            />
          </Show>
        </div>
      </A>
    </li>
  );
}

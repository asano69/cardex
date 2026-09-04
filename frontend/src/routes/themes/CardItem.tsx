import { A } from "@solidjs/router";
import type { CardRecord } from "./CardForm";

export interface CardItemProps {
  card: CardRecord;
}

// Flattens a ProseKit doc JSON into plain text for the card preview,
// joining top-level blocks with a newline. .description's
// white-space: pre-line renders those newlines as line breaks.
function previewText(doc: any): string {
  const blocks: any[] = doc?.content ?? [];
  return blocks.map(blockText).join("\n");
}

function blockText(node: any): string {
  if (node.type === "text") return node.text ?? "";
  const children: any[] = node.content ?? [];
  return children.map(blockText).join("");
}

// A single card in ThemeDetail's card grid, styled to match Cosense's
// own page-list card (see .card-grid-item in styles/components.css).
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
          <div class="description">{previewText(props.card.content)}</div>
        </div>
      </A>
    </li>
  );
}

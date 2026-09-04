import { For, Show } from "solid-js";
import type { CardRecord } from "./CardForm";

export interface CardItemProps {
  card: CardRecord;
}

// A single card rendered as a Scrapbox/Cosense-style page card: a
// colored title followed by the body split into outline-style lines
// with a left guide line, instead of plain paragraphs. Used by
// ThemeDetail's card grid.
export default function CardItem(props: CardItemProps) {
  const lines = () =>
    props.card.content.split("\n").filter((line) => line.trim() !== "");

  return (
    <div class="scrapbox-card">
      <div class="scrapbox-card-title">{props.card.title}</div>
      <div class="scrapbox-card-body">
        <For each={lines()}>
          {(line) => <p class="scrapbox-card-line">{line}</p>}
        </For>
      </div>
      <Show when={props.card.kind}>
        <span class="scrapbox-card-tag">#{props.card.kind}</span>
      </Show>
    </div>
  );
}

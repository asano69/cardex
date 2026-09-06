import { createResource, createMemo, For, Show, onCleanup } from "solid-js";
import { useParams, A } from "@solidjs/router";
import { ChevronsLeft as ChevronLeft, Plus } from "../../lib/icons";
import Sortable from "sortablejs";

import pb from "../../lib/pb";
import Loading from "../../components/Loading";
import CardItem from "./CardItem";
import { cardsById, mergeCards } from "../../lib/cardsStore";
import { computePosition } from "../../lib/position";
import type { IssueRecord } from "./IssueForm";
import type { CardRecord } from "./CardForm";

async function fetchIssue(id: string): Promise<IssueRecord> {
  return await pb.collection("issues").getOne<IssueRecord>(id);
}

// Fetches every card belonging to this issue and seeds them into the
// shared cards store (see lib/cardsStore.ts). The `cards` memo below
// then renders from that store instead of from this one-shot result,
// so it stays live as other users' edits/creates/deletes arrive over
// the realtime subscription started in AppShell.
async function fetchCards(issueId: string): Promise<void> {
  const records = await pb.collection("cards").getFullList<CardRecord>({
    filter: pb.filter("issue = {:issue}", { issue: issueId }),
    sort: "-created",
  });
  mergeCards(records);
}

// Detail page for a single issue, reached via the folder-open button on
// IssueItem: the issue's title, an add-card button, and every card
// belonging to it laid out as a Scrapbox/Cosense-style card grid (see
// CardItem).
export default function IssueDetail() {
  const params = useParams();
  const [issue] = createResource(() => params.id, fetchIssue);
  const [cardsLoaded] = createResource(() => params.id, fetchCards);

  // Sorted by the fractional-indexing "position" column (see
  // lib/position.ts), with id as a tie-breaker for equal positions.
  // Derived from the shared store rather than cardsLoaded directly, so
  // this list reacts to realtime create/update/delete events too, not
  // just the initial fetch above.
  const cards = createMemo(() =>
    Object.values(cardsById)
      .filter((card) => card.issue === params.id)
      .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id)),
  );

  // Persists a drag-to-reorder drop: only the moved card's own
  // position changes (see lib/position.ts), computed from whichever
  // two cards now sit on either side of it -- this works the same way
  // whether `cards()` holds all 10 cards an issue has or one page of a
  // filtered, paginated view of 3000.
  const handleSortEnd = async (evt: Sortable.SortableEvent) => {
    const { oldIndex, newIndex } = evt;
    if (oldIndex == null || newIndex == null || oldIndex === newIndex) return;

    const ordered = cards();
    const moved = ordered[oldIndex];
    if (!moved) return;

    const rest = ordered.filter((card) => card.id !== moved.id);
    const position = computePosition(
      rest[newIndex - 1]?.position,
      rest[newIndex]?.position,
    );

    try {
      const updated = await pb
        .collection("cards")
        .update<CardRecord>(moved.id, { position });
      mergeCards([updated]);
    } catch (err) {
      console.error("[issues] failed to reorder card:", err);
    }
  };

  // Hands DOM drag handling off to SortableJS once the grid is
  // mounted: a 2D wrapping grid needs proper nearest-cell hit testing
  // that isn't worth reimplementing (unlike the single-column
  // pointer-distance approach in routes/issues/IssueItem.tsx).
  const mountSortableGrid = (el: HTMLUListElement) => {
    const sortable = Sortable.create(el, {
      animation: 150,
      onEnd: handleSortEnd,
    });
    onCleanup(() => sortable.destroy());
  };

  return (
    <div class="flex w-full flex-col gap-4">
      <div class="flex items-center justify-between">
        <A href="/issues" class="icon-btn" aria-label="Back to issues">
          <ChevronLeft size={20} />
        </A>
        <A
          href={`/issues/${params.id}/cards/new`}
          class="icon-btn"
          aria-label="Add card"
        >
          <Plus size={20} />
        </A>
      </div>
 
        <h1 class="font-sans text-xl">{issue()?.title}</h1>
     
      <Show when={!cardsLoaded.loading} fallback={<Loading />}>
        <ul class="card-grid" ref={mountSortableGrid}>
          <For each={cards()}>{(card) => <CardItem card={card} />}</For>
        </ul>
      </Show>
    </div>
  );
}

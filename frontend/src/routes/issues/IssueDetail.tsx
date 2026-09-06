import { createResource, createMemo, For, Show } from "solid-js";
import { useParams, A } from "@solidjs/router";
import { ChevronsLeft as ChevronLeft, Plus } from "../../lib/icons";
import { DragDropProvider } from "@dnd-kit/solid";
import { isSortable } from "@dnd-kit/solid/sortable";
import { PointerSensor, KeyboardSensor } from "@dnd-kit/dom";

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
// CardItem wraps the whole card in an <a> link (see CardItem.tsx), and
// PointerSensor's default preventActivation refuses to start a drag on
// interactive elements (<a>/<button>/<input>) unless they're the
// designated drag handle -- that's why no drag ever activated here.
// Overriding it lets a pointerdown on the card start tracking; the
// default per-pointer-type activation constraint (5px of movement for
// mouse) still lets a plain click with no movement fall through to the
// link's normal navigation, and only real dragging hijacks it.
const sensors = [
  PointerSensor.configure({
    preventActivation: () => false,
  }),
  KeyboardSensor,
];

export default function IssueDetail() {
  const params = useParams();
  const [issue] = createResource(() => params.id, fetchIssue);
  const [cardsLoaded] = createResource(() => params.id, fetchCards);

  // Sorted descending by the fractional-indexing "position" column
  // (see lib/position.ts), with id as a tie-breaker for equal
  // positions -- new cards get the highest position (see CardForm),
  // so this puts the newest card first. Derived from the shared store
  // rather than cardsLoaded directly, so this list reacts to realtime
  // create/update/delete events too, not just the initial fetch above.
  const cards = createMemo(() =>
    Object.values(cardsById)
      .filter((card) => card.issue === params.id)
      .sort((a, b) => b.position - a.position || a.id.localeCompare(b.id)),
  );

  // Persists a drag-to-reorder drop: only the moved card's own
  // position changes (see lib/position.ts), computed from whichever
  // two cards now sit on either side of it -- this works the same way
  // whether `cards()` holds all 10 cards an issue has or one page of a
  // filtered, paginated view of 3000.
  //
  // dnd-kit reports the drop via event.operation.source rather than
  // SortableJS's oldIndex/newIndex; isSortable narrows that source so
  // its initialIndex/index can be read instead.
  const handleDragEnd = async (event) => {
    if (event.canceled) return;
    const { source } = event.operation;
    if (!isSortable(source)) return;

    const { initialIndex, index: newIndex } = source;
    if (initialIndex === newIndex) return;

    const ordered = cards();
    const moved = ordered[initialIndex];
    if (!moved) return;

    const rest = ordered.filter((card) => card.id !== moved.id);
    // The grid is sorted by descending position (see `cards` above),
    // so the card displayed above has the larger position and the
    // card displayed below has the smaller one -- the opposite of
    // computePosition's (prev, next) argument order, so they're
    // swapped here.
    const position = computePosition(
      rest[newIndex]?.position,
      rest[newIndex - 1]?.position,
    );

    // Apply the new position to the shared store immediately, before
    // the PocketBase round-trip resolves. dnd-kit resets its own
    // optimistic DOM order back to whatever `cards()` currently
    // returns as soon as the drag ends, so without this the grid
    // visibly snaps back to the old order and then jumps again once
    // the request completes. Rolled back below if the request fails.
    const previousPosition = moved.position;
    mergeCards([{ ...moved, position }]);

    try {
      const updated = await pb
        .collection("cards")
        .update<CardRecord>(moved.id, { position });
      mergeCards([updated]);
    } catch (err) {
      console.error("[issues] failed to reorder card:", err);
      mergeCards([{ ...moved, position: previousPosition }]);
    }
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
        <DragDropProvider sensors={sensors} onDragEnd={handleDragEnd}>
          <ul class="card-grid">
            <For each={cards()}>
              {(card, index) => <CardItem card={card} index={index()} />}
            </For>
          </ul>
        </DragDropProvider>
      </Show>
    </div>
  );
}

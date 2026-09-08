import {
  createResource,
  createMemo,
  createSignal,
  For,
  Show,
  onCleanup,
} from "solid-js";
import { useParams } from "@solidjs/router";
import { DragDropProvider } from "@dnd-kit/solid";
import { isSortable } from "@dnd-kit/solid/sortable";
import { PointerSensor, KeyboardSensor } from "@dnd-kit/dom";

import pb from "../../lib/pb";
import Loading from "../../components/Loading";
import CardItem from "./CardItem";
import { cardsById, mergeCards } from "../../lib/cardsStore";
import { computePosition } from "../../lib/position";
import { fetchPotBySlug } from "../../lib/pots";
import { useTitle } from "../../lib/useTitle";
import type { CardRecord } from "./CardForm";

// How many cards to fetch per page. Cards render as soon as their
// page arrives (see loadPage below) instead of waiting for the whole
// pot to load, so this mainly bounds the worst-case first request for
// a pot with a huge number of cards.
const PAGE_SIZE = 100;

// Detail page for a single pot, reached via the folder-open button on
// PotItem: the pot's title, an add-card button, and every card
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

export default function CardList() {
  const params = useParams();
  const [pot] = createResource(() => params.slug, fetchPotBySlug);
  // Browser tab title: the pot's own name (see useTitle.ts). CardForm
  // one level down uses "<card> - <pot>" for the same `pot` shape.
  useTitle(() => pot()?.title);
  // TopBar's pot-name link (and the "add card" button next to it) is
  // now registered once by the parent PotLayout route, not here -- see
  // lib/router.tsx and routes/pots/PotLayout.tsx.

  // Whether the first page of cards has arrived. This -- not "every
  // page has arrived" -- is what gates the Loading spinner below, so
  // cards appear as soon as page 1 is in rather than waiting for the
  // whole pot to load.
  const [firstPageLoaded, setFirstPageLoaded] = createSignal(false);
  // Whether a further page is currently being fetched, and whether
  // there's another page left to fetch at all. Both drive the
  // sentinel row at the bottom of the grid (see the Show below).
  const [loadingMore, setLoadingMore] = createSignal(false);
  const [hasMore, setHasMore] = createSignal(true);

  // Plain (non-reactive) pagination bookkeeping: only loadPage/loadMore
  // read or write these, so they don't need to be signals.
  let nextPage = 1;
  let currentPotId: string | undefined;

  // Fetches one page of cards for `potId` and merges it straight into
  // the shared store (see lib/cardsStore.ts), so each page renders the
  // moment it arrives instead of waiting for the whole pot to load.
  // skipFlip is set here since this is an initial/paginated load, not
  // a reorder -- there's nothing to FLIP-animate from.
  const loadPage = async (potId: string) => {
    const page = nextPage;
    const result = await pb
      .collection("cards")
      .getList<CardRecord>(page, PAGE_SIZE, {
        filter: pb.filter("pot = {:pot}", { pot: potId }),
        sort: "-created",
      });
    mergeCards(result.items, { skipFlip: true });
    nextPage = page + 1;
    setHasMore(page < result.totalPages);
  };

  // Cards relate to the pot by its PocketBase id (see the "cards"
  // collection's "pot" relation field), not its slug, so this waits
  // for `pot` to resolve before fetching. Only the first page is
  // fetched eagerly; later pages are fetched on demand as the sentinel
  // row below scrolls into view (see loadMore).
  createResource(
    () => pot()?.id,
    async (potId) => {
      currentPotId = potId;
      nextPage = 1;
      setFirstPageLoaded(false);
      setHasMore(true);
      await loadPage(potId);
      setFirstPageLoaded(true);
    },
  );

  // Fetches the next page, guarded against overlapping calls (e.g. the
  // sentinel staying in view while a page is already loading) and
  // against firing once every page has already been fetched.
  const loadMore = async () => {
    if (loadingMore() || !hasMore() || !currentPotId) return;
    setLoadingMore(true);
    try {
      await loadPage(currentPotId);
    } catch (err) {
      console.error("[pots] failed to load more cards:", err);
    } finally {
      setLoadingMore(false);
    }
  };

  // Sentinel element at the bottom of the grid: once it scrolls into
  // view, the next page is fetched. A single shared observer instance
  // is reused across re-renders instead of being recreated each time,
  // so an intersection is never missed while a page is loading.
  const sentinelObserver = new IntersectionObserver((entries) => {
    if (entries.some((entry) => entry.isIntersecting)) loadMore();
  });
  const setSentinelRef = (el: HTMLDivElement) => {
    sentinelObserver.observe(el);
  };
  onCleanup(() => sentinelObserver.disconnect());

  // Sorted descending by the fractional-indexing "position" column
  // (see lib/position.ts), with id as a tie-breaker for equal
  // positions -- new cards get the highest position (see CardForm),
  // so this puts the newest card first. Derived from the shared store
  // rather than cardsLoaded directly, so this list reacts to realtime
  // create/update/delete events too, not just the initial fetch above.
  const cards = createMemo(() =>
    Object.values(cardsById)
      .filter((card) => card.pot === pot()?.id)
      // Pinned cards always sort before unpinned ones; within each
      // group the existing position/id ordering is unchanged.
      .sort((a, b) => {
        if (a.pin !== b.pin) return a.pin ? -1 : 1;
        return b.position - a.position || a.id.localeCompare(b.id);
      }),
  );

  // Persists a drag-to-reorder drop: only the moved card's own
  // position changes (see lib/position.ts), computed from whichever
  // two cards now sit on either side of it -- this works the same way
  // whether `cards()` holds all 10 cards an pot has or one page of a
  // filtered, paginated view of 3000.
  //
  // dnd-kit reports the drop via event.operation.source rather than
  // SortableJS's oldIndex/newIndex; isSortable narrows that source so
  // its initialIndex/index can be read instead.
  // How long to wait, after the local optimistic reorder is applied,
  // before sending the new position to PocketBase. This client is
  // also subscribed to its own realtime "cards" updates (see
  // startCardsSubscription in lib/cardsStore.ts), and that handler
  // always runs the FLIP animation, which sets the same element's
  // `transform` that dnd-kit's own drop animation is still settling
  // right after a drag ends. Delaying only the network request (not
  // the local store update below) means the resulting echo arrives
  // once dnd-kit's animation has long finished, so the FLIP handler
  // measures identical before/after rects and animates nothing.
  // Realtime propagation to other users isn't latency-sensitive
  // enough for this brief delay to matter.
  const PERSIST_DELAY_MS = 300;

  const handleDragEnd = (event) => {
    if (event.canceled) return;
    const { source } = event.operation;
    if (!isSortable(source)) return;

    const { initialIndex, index: newIndex } = source;
    if (initialIndex === newIndex) return;

    const ordered = cards();
    const moved = ordered[initialIndex];
    if (!moved) return;

    // Pinned cards always sort before unpinned ones (see `cards`
    // above). Clamp the drop target to the same pin group so a drag
    // that overshoots past the group's boundary can't compute a
    // position that crosses into the other group -- that would leave
    // the card visually stranded until the next reload re-sorts it
    // back by pin.
    const groupSize = ordered.filter((card) => card.pin === moved.pin).length;
    const groupStart = moved.pin ? 0 : ordered.length - groupSize;
    const groupEnd = groupStart + groupSize - 1;
    const clampedIndex = Math.min(Math.max(newIndex, groupStart), groupEnd);
    if (initialIndex === clampedIndex) return;

    const rest = ordered.filter((card) => card.id !== moved.id);
    // The grid is sorted by descending position (see `cards` above),
    // so the card displayed above has the larger position and the
    // card displayed below has the smaller one -- the opposite of
    // computePosition's (prev, next) argument order, so they're
    // swapped here.
    const position = computePosition(
      rest[clampedIndex]?.position,
      rest[clampedIndex - 1]?.position,
    );

    // Applied immediately, in step with dnd-kit's own drop animation
    // settling the dragged card into this same slot. skipFlip: true
    // since this is the local dragger's own move -- there's nothing
    // left to FLIP-animate once dnd-kit has already shown the card
    // moving there itself.
    const previousPosition = moved.position;
    mergeCards([{ ...moved, position }], { skipFlip: true });

    // Only the PocketBase round-trip (and the realtime echo it
    // triggers) is deferred -- see PERSIST_DELAY_MS above.
    setTimeout(async () => {
      try {
        const updated = await pb
          .collection("cards")
          .update<CardRecord>(moved.id, { position });
        mergeCards([updated], { skipFlip: true });
      } catch (err) {
        console.error("[pots] failed to reorder card:", err);
        mergeCards([{ ...moved, position: previousPosition }], {
          skipFlip: true,
        });
      }
    }, PERSIST_DELAY_MS);
  };

  return (
    <Show when={firstPageLoaded()} fallback={<Loading />}>
      <DragDropProvider sensors={sensors} onDragEnd={handleDragEnd}>
        <ul class="card-grid">
          <For each={cards()}>
            {(card, index) => (
              <CardItem card={card} index={index()} potSlug={params.slug} />
            )}
          </For>
        </ul>
      </DragDropProvider>
      {/* Sentinel row: fetching the next page is triggered by this
          element scrolling into view (see setSentinelRef above), not
          by an explicit "load more" button. */}
      <Show when={hasMore()}>
        <div ref={setSentinelRef}>
          <Show when={loadingMore()}>
            <Loading />
          </Show>
        </div>
      </Show>
    </Show>
  );
}

import {
  createMemo,
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
} from "solid-js";
import { useParams } from "@solidjs/router";
import { DragDropProvider } from "@dnd-kit/solid";
import { isSortable } from "@dnd-kit/solid/sortable";
import { PointerSensor, KeyboardSensor } from "@dnd-kit/dom";

import pb from "../../lib/pb";
import Loading from "../../components/Loading";
import CardItem from "./CardItem";
import { cardsById, cardsLoaded, mergeCards } from "../../lib/cardsStore";
import { computePosition } from "../../lib/position";
import { useTitle } from "../../lib/useTitle";
import { usePot } from "../pots/PotContext";

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
  // Fetched once by the parent PotLayout route and shared via
  // PotContext, instead of fetching it again here -- a second
  // identical fetchPotBySlug request used to get auto-cancelled by
  // PocketBase's SDK when navigating right after CardList mounted.
  const pot = usePot();
  // Browser tab title: the pot's own name (see useTitle.ts). CardForm
  // one level down uses "<card> - <pot>" for the same `pot` shape.
  useTitle(() => pot()?.title);
  // TopBar's pot-name link (and the "add card" button next to it) is
  // now registered once by the parent PotLayout route, not here -- see
  // lib/router.tsx and routes/pots/PotLayout.tsx.

  // The whole "cards" collection is now fetched once for the app's
  // entire lifetime (see AppShell.tsx and lib/cardsStore.ts's
  // loadAllCards), not paginated per pot per CardList mount -- this
  // just waits for that one fetch to have landed.

  // Sorted descending by the fractional-indexing "position" column
  // (see lib/position.ts), with id as a tie-breaker for equal
  // positions -- new cards get the highest position (see CardForm),
  // so this puts the newest card first. Derived from the shared store,
  // so this list reacts to realtime create/update/delete events too,
  // not just the initial fetch.
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

  // How many of `cards()` are actually mounted into the DOM. A pot
  // with thousands of cards would otherwise mount that many CardItems
  // (each with its own useSortable registration) at once, which was
  // enough to freeze the tab entirely -- see loadMoreOnScroll below.
  const PAGE_SIZE = 100;
  const [visibleCount, setVisibleCount] = createSignal(PAGE_SIZE);
  const visibleCards = createMemo(() => cards().slice(0, visibleCount()));

  // Reveals another PAGE_SIZE cards whenever the sentinel at the end
  // of the grid scrolls into view. This intentionally does nothing
  // about dnd-kit's own per-card registration cost once thousands of
  // cards have scrolled past and accumulated in the DOM -- that's a
  // separate problem, left for later.
  let sentinelRef: HTMLLIElement | undefined;
  onMount(() => {
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        setVisibleCount((count) => count + PAGE_SIZE);
      }
    });
    if (sentinelRef) observer.observe(sentinelRef);
    onCleanup(() => observer.disconnect());
  });

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
    // above), but their positions are on a completely separate scale
    // from unpinned ones (each new pin gets half of the lowest
    // existing pinned position -- see nextPinnedPosition in
    // CardForm.tsx). So neighbor lookups below must never cross into
    // the other pin group: averaging a pinned card's (tiny) position
    // with an unpinned card's (much larger) one could produce a value
    // that isn't actually above every other unpinned card, landing
    // the dragged card second or later instead of first.
    const group = ordered.filter((card) => card.pin === moved.pin);
    const groupStart = moved.pin ? 0 : ordered.length - group.length;
    const groupEnd = groupStart + group.length - 1;
    const clampedIndex = Math.min(Math.max(newIndex, groupStart), groupEnd);
    if (initialIndex === clampedIndex) return;

    // Index of the drop target within its own group, and that group's
    // cards with `moved` removed -- restricting computePosition's
    // neighbors to this same-group list is what keeps the boundary
    // case above from mixing in the other group's positions.
    const indexInGroup = clampedIndex - groupStart;
    const restInGroup = group.filter((card) => card.id !== moved.id);
    // The grid is sorted by descending position (see `cards` above),
    // so the card displayed above has the larger position and the
    // card displayed below has the smaller one -- the opposite of
    // computePosition's (prev, next) argument order, so they're
    // swapped here.
    const position = computePosition(
      restInGroup[indexInGroup]?.position,
      restInGroup[indexInGroup - 1]?.position,
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
    <Show when={cardsLoaded()} fallback={<Loading />}>
      <DragDropProvider sensors={sensors} onDragEnd={handleDragEnd}>
        <ul class="card-grid">
          <For each={visibleCards()}>
            {(card, index) => (
              <CardItem card={card} index={index()} potSlug={params.slug} />
            )}
          </For>
          {/* Invisible row-spanning marker: growing visibleCount when
              this scrolls into view is what drives the infinite
              scroll above. */}
          <li ref={sentinelRef} aria-hidden="true" class="col-span-full h-px" />
        </ul>
      </DragDropProvider>
    </Show>
  );
}

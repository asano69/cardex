import { createMemo, createSignal, onMount, For, Show } from "solid-js";
import { DragDropProvider } from "@dnd-kit/solid";
import { isSortable } from "@dnd-kit/solid/sortable";
import { PointerSensor, KeyboardSensor } from "@dnd-kit/dom";

import pb from "../../lib/pb";
import Loading from "../../components/Loading";
import PotGridItem from "./PotGridItem";
import PotForm from "./PotForm";
import { computePosition } from "../../lib/position";
import type { PotRecord } from "./PotForm";

// Same override as CardList's own sensors: without it, PointerSensor's
// default preventActivation refuses to start a drag from inside an
// interactive element (the pot card's <a>, or its ActionsMenu
// trigger), which is exactly what every pot card is built from.
const sensors = [
  PointerSensor.configure({
    preventActivation: () => false,
  }),
  KeyboardSensor,
];

// Top-level pot list, styled like CardList's card grid (see
// CardItem/CardList) rather than the old task-list layout (still kept,
// unused, in ./index.tsx and ./PotItem.tsx). Opening a pot now
// navigates straight to its card list instead of expanding inline;
// renaming/deleting move to each card's own ActionsMenu (see
// PotGridItem.tsx).
export default function PotList() {
  const [pots, setPots] = createSignal<PotRecord[]>([]);
  const [loaded, setLoaded] = createSignal(false);

  const loadPots = async () => {
    try {
      const result = await pb
        .collection("pots")
        .getFullList<PotRecord>({ sort: "position" });
      setPots(result);
    } catch (err) {
      console.error("[pots] failed to load pots:", err);
    } finally {
      setLoaded(true);
    }
  };

  onMount(loadPots);

  // Position for a newly created pot: one past the current highest
  // position, so it's always appended at the end regardless of any
  // gaps left by earlier deletes or reorders. Unchanged from the old
  // index.tsx -- new pots still start on this simple incrementing
  // scale; only reordering (below) switches to fractional indexing.
  const nextPosition = () =>
    pots().length === 0 ? 0 : Math.max(...pots().map((p) => p.position)) + 1;

  const handleAdded = (record: PotRecord) => {
    setPots((prev) => [...prev, record]);
  };

  const handleChanged = (record: PotRecord) => {
    setPots((prev) => prev.map((p) => (p.id === record.id ? record : p)));
  };

  const handleDeleted = (pot: PotRecord) => {
    setPots((prev) => prev.filter((p) => p.id !== pot.id));
  };

  // Sorted ascending by "position" -- unlike CardList's cards, pots
  // have no pin concept, so this is a single flat ordering.
  const ordered = createMemo(() =>
    [...pots()].sort((a, b) => a.position - b.position),
  );

  // Persists a drag-to-reorder drop the same way CardList does: only
  // the moved pot's own position changes, computed from fractional
  // indexing (see lib/position.ts) between whichever two pots now sit
  // on either side of it -- no full-list renumber needed.
  const handleDragEnd = (event) => {
    if (event.canceled) return;
    const { source } = event.operation;
    if (!isSortable(source)) return;

    const { initialIndex, index: newIndex } = source;
    if (initialIndex === newIndex) return;

    const list = ordered();
    const moved = list[initialIndex];
    if (!moved) return;

    const rest = list.filter((p) => p.id !== moved.id);
    // Ascending order: the pot now before the drop slot has the
    // smaller position, the one after has the larger -- the same
    // order computePosition's (prev, next) already expects.
    const position = computePosition(
      rest[newIndex - 1]?.position,
      rest[newIndex]?.position,
    );

    const previousPosition = moved.position;
    handleChanged({ ...moved, position });

    (async () => {
      try {
        const updated = await pb
          .collection("pots")
          .update<PotRecord>(moved.id, { position });
        handleChanged(updated);
      } catch (err) {
        console.error("[pots] failed to reorder pot:", err);
        handleChanged({ ...moved, position: previousPosition });
      }
    })();
  };

  return (
    <div class="flex w-full flex-col gap-4">
      <Show when={loaded()} fallback={<Loading />}>
        <DragDropProvider sensors={sensors} onDragEnd={handleDragEnd}>
          <ul class="card-grid">
            <For each={ordered()}>
              {(pot, index) => (
                <PotGridItem
                  pot={pot}
                  index={index()}
                  onChanged={handleChanged}
                  onDeleted={handleDeleted}
                />
              )}
            </For>
          </ul>
        </DragDropProvider>
      </Show>

      <PotForm
        hasExistingPots={pots().length > 0}
        nextPosition={nextPosition()}
        onAdded={handleAdded}
      />
    </div>
  );
}

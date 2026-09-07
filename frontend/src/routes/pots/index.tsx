import { createSignal, onMount, onCleanup, For } from "solid-js";

import pb from "../../lib/pb";
import PotItem from "./PotItem";
import PotForm from "./PotForm";
import type { PotRecord } from "./PotForm";

// Pots is a list of topics the user wants to think about: an
// add-pot input followed by the list, each with a done/not-done
// state, inline rename, drag-to-reorder, and delete. Every mutation
// (add/toggle/rename/delete/reorder) is owned by the component that
// triggers it (PotForm/PotItem/this page); this page only holds
// the loaded list and re-syncs it from whatever record each mutation
// reports back.
export default function Pots() {
  const [pots, setPots] = createSignal<PotRecord[]>([]);
  // Pot id currently being dragged, or null when nothing is dragging.
  // Drives each row's dimmed styling (see PotItem's `dragging` prop)
  // and lets handlePointerMove know which pot to move.
  const [draggingId, setDraggingId] = createSignal<string | null>(null);
  // Plain (non-reactive) map of pot id -> row element, populated via
  // PotItem's rowRef prop. Only used to measure row positions during
  // a drag, so it doesn't need to be a Solid store.
  const rowRefs = new Map<string, HTMLDivElement>();

  const loadPots = async () => {
    try {
      const result = await pb
        .collection("pots")
        .getFullList<PotRecord>({ sort: "position" });
      setPots(result);
    } catch (err) {
      console.error("[pots] failed to load pots:", err);
    }
  };

  onMount(loadPots);

  // Position for a newly created pot: one past the current highest
  // position, so it's always appended at the end regardless of any
  // gaps left by earlier deletes or reorders.
  const nextPosition = () =>
    pots().length === 0
      ? 0
      : Math.max(...pots().map((t) => t.position)) + 1;

  const handleAdded = (record: PotRecord) => {
    setPots((prev) => [...prev, record]);
  };

  const handleChanged = (record: PotRecord) => {
    setPots((prev) => prev.map((t) => (t.id === record.id ? record : t)));
  };

  const handleDeleted = (pot: PotRecord) => {
    rowRefs.delete(pot.id);
    setPots((prev) => prev.filter((t) => t.id !== pot.id));
  };

  // Drag-to-reorder: pointer events instead of native HTML5
  // drag-and-drop, so the same code handles touch (mobile) and mouse
  // (desktop). While dragging, the list is reordered live by finding
  // the row whose current midpoint is closest to the pointer. The new
  // order is only persisted to PocketBase once the drag ends.
  const handleDragStart = (potId: string) => (event: PointerEvent) => {
    event.preventDefault();
    setDraggingId(potId);
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  };

  const handlePointerMove = (event: PointerEvent) => {
    const draggedId = draggingId();
    if (!draggedId) return;
    const currentIndex = pots().findIndex((t) => t.id === draggedId);
    if (currentIndex === -1) return;

    let targetIndex = currentIndex;
    let closestDistance = Infinity;
    pots().forEach((t, i) => {
      const el = rowRefs.get(t.id);
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const center = rect.top + rect.height / 2;
      const distance = Math.abs(event.clientY - center);
      if (distance < closestDistance) {
        closestDistance = distance;
        targetIndex = i;
      }
    });

    if (targetIndex !== currentIndex) {
      setPots((prev) => {
        const next = [...prev];
        const [dragged] = next.splice(currentIndex, 1);
        next.splice(targetIndex, 0, dragged);
        return next;
      });
    }
  };

  const handlePointerUp = () => {
    window.removeEventListener("pointermove", handlePointerMove);
    window.removeEventListener("pointerup", handlePointerUp);
    setDraggingId(null);
    persistOrder();
  };

  // Renumbers every pot's position to match its current index and
  // saves only the ones that actually changed, so a drag that ends up
  // back in its original order makes no requests at all.
  const persistOrder = async () => {
    const current = pots();
    const updates = current
      .map((pot, index) => ({ pot, index }))
      .filter(({ pot, index }) => pot.position !== index);

    if (updates.length === 0) return;

    try {
      await Promise.all(
        updates.map(({ pot, index }) =>
          pb
            .collection("pots")
            .update<PotRecord>(pot.id, { position: index }),
        ),
      );
      setPots((prev) =>
        prev.map((pot, index) => ({ ...pot, position: index })),
      );
    } catch (err) {
      console.error("[pots] failed to save pot order:", err);
    }
  };

  onCleanup(() => {
    window.removeEventListener("pointermove", handlePointerMove);
    window.removeEventListener("pointerup", handlePointerUp);
  });

  return (
    <div class="flex w-full flex-col gap-4">
      <h1 class="mb-4 font-sans text-2xl">Pots</h1>

      <PotForm
        hasExistingPots={pots().length > 0}
        nextPosition={nextPosition()}
        onAdded={handleAdded}
      />
      <div class="flex flex-col gap-2">
        <For each={pots()}>
          {(pot) => (
            <PotItem
              pot={pot}
              onChanged={handleChanged}
              onDeleted={handleDeleted}
              rowRef={(el) => rowRefs.set(pot.id, el)}
              dragging={draggingId() === pot.id}
              onDragStart={handleDragStart(pot.id)}
            />
          )}
        </For>
      </div>
    </div>
  );
}

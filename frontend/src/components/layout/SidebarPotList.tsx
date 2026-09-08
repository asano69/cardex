import { createMemo, createSignal, onMount, For, Show } from "solid-js";
import { A } from "@solidjs/router";
import { DragDropProvider } from "@dnd-kit/solid";
import { useSortable, isSortable } from "@dnd-kit/solid/sortable";
import { PointerSensor, KeyboardSensor } from "@dnd-kit/dom";

import pb from "../../lib/pb";
import { computePosition } from "../../lib/position";
import type { PotRecord } from "../../routes/pots/PotForm";

// Same override as PotList/CardList's own sensors: without it,
// PointerSensor's default preventActivation refuses to start a drag
// from inside an interactive element (each row's <a>).
const sensors = [
  PointerSensor.configure({
    preventActivation: () => false,
  }),
  KeyboardSensor,
];

interface SidebarPotRowProps {
  pot: PotRecord;
  index: number;
}

// A single low, single-column row -- unlike PotList's square
// card-grid-item, but reusing the same color tokens (border/bg/hover/
// shadow) so it still reads as part of the same design.
function SidebarPotRow(props: SidebarPotRowProps) {
  // Getter syntax (not a plain destructure) so the hook re-reads
  // id/index reactively instead of only once at setup -- see
  // dnd-kit's Solid docs (same as CardItem/PotGridItem).
  const { ref, isDragging } = useSortable({
    get id() {
      return props.pot.id;
    },
    get index() {
      return props.index;
    },
  });

  return (
    <li ref={ref} classList={{ "opacity-40": isDragging() }}>
      <A
        href={`/${props.pot.slug}`}
        activeClass="bg-active-bg"
        class="block truncate rounded-md border border-border bg-card px-2 py-1.5 text-sm text-text shadow-card transition-colors hover:bg-hover-bg"
      >
        {props.pot.title}
      </A>
    </li>
  );
}

// Sidebar-only list of pots: read-only besides drag-to-reorder --
// adding/renaming/deleting a pot still happens on the pots page. Kept
// as its own component (not folded into Sidebar.tsx) since it owns
// its own fetch and reorder logic, mirroring PotList.tsx's pattern.
export default function SidebarPotList() {
  const [pots, setPots] = createSignal<PotRecord[]>([]);

  onMount(async () => {
    try {
      const result = await pb
        .collection("pots")
        .getFullList<PotRecord>({ sort: "position" });
      setPots(result);
    } catch (err) {
      console.error("[sidebar] failed to load pots:", err);
    }
  });

  const ordered = createMemo(() =>
    [...pots()].sort((a, b) => a.position - b.position),
  );

  // Persists a drag-to-reorder drop the same way PotList does: only
  // the moved pot's own position changes (fractional indexing, see
  // lib/position.ts), so reordering here stays consistent with
  // reordering on the pots page.
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
    const position = computePosition(
      rest[newIndex - 1]?.position,
      rest[newIndex]?.position,
    );

    const previousPosition = moved.position;
    setPots((prev) =>
      prev.map((p) => (p.id === moved.id ? { ...p, position } : p)),
    );

    (async () => {
      try {
        const updated = await pb
          .collection("pots")
          .update<PotRecord>(moved.id, { position });
        setPots((prev) =>
          prev.map((p) => (p.id === updated.id ? updated : p)),
        );
      } catch (err) {
        console.error("[sidebar] failed to reorder pot:", err);
        setPots((prev) =>
          prev.map((p) =>
            p.id === moved.id ? { ...p, position: previousPosition } : p,
          ),
        );
      }
    })();
  };

  return (
    <Show when={ordered().length > 0}>
      <DragDropProvider sensors={sensors} onDragEnd={handleDragEnd}>
        <ul class="flex flex-col gap-1 p-2">
          <For each={ordered()}>
            {(pot, index) => <SidebarPotRow pot={pot} index={index()} />}
          </For>
        </ul>
      </DragDropProvider>
    </Show>
  );
}

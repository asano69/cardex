import { createSignal, onMount, onCleanup, For } from "solid-js";

import pb from "../../lib/pb";
import ThemeItem from "./ThemeItem";
import ThemeForm from "./ThemeForm";
import type { ThemeRecord } from "./ThemeForm";

// Themes is a list of topics the user wants to think about: an
// add-theme input followed by the list, each with a done/not-done
// state, inline rename, drag-to-reorder, and delete. Every mutation
// (add/toggle/rename/delete/reorder) is owned by the component that
// triggers it (ThemeForm/ThemeItem/this page); this page only holds
// the loaded list and re-syncs it from whatever record each mutation
// reports back.
export default function Themes() {
  const [themes, setThemes] = createSignal<ThemeRecord[]>([]);
  // Theme id currently being dragged, or null when nothing is dragging.
  // Drives each row's dimmed styling (see ThemeItem's `dragging` prop)
  // and lets handlePointerMove know which theme to move.
  const [draggingId, setDraggingId] = createSignal<string | null>(null);
  // Plain (non-reactive) map of theme id -> row element, populated via
  // ThemeItem's rowRef prop. Only used to measure row positions during
  // a drag, so it doesn't need to be a Solid store.
  const rowRefs = new Map<string, HTMLDivElement>();

  const loadThemes = async () => {
    try {
      const result = await pb
        .collection("themes")
        .getFullList<ThemeRecord>({ sort: "position" });
      setThemes(result);
    } catch (err) {
      console.error("[themes] failed to load themes:", err);
    }
  };

  onMount(loadThemes);

  // Position for a newly created theme: one past the current highest
  // position, so it's always appended at the end regardless of any
  // gaps left by earlier deletes or reorders.
  const nextPosition = () =>
    themes().length === 0
      ? 0
      : Math.max(...themes().map((t) => t.position)) + 1;

  const handleAdded = (record: ThemeRecord) => {
    setThemes((prev) => [...prev, record]);
  };

  const handleChanged = (record: ThemeRecord) => {
    setThemes((prev) => prev.map((t) => (t.id === record.id ? record : t)));
  };

  const handleDeleted = (theme: ThemeRecord) => {
    rowRefs.delete(theme.id);
    setThemes((prev) => prev.filter((t) => t.id !== theme.id));
  };

  // Drag-to-reorder: pointer events instead of native HTML5
  // drag-and-drop, so the same code handles touch (mobile) and mouse
  // (desktop). While dragging, the list is reordered live by finding
  // the row whose current midpoint is closest to the pointer. The new
  // order is only persisted to PocketBase once the drag ends.
  const handleDragStart = (themeId: string) => (event: PointerEvent) => {
    event.preventDefault();
    setDraggingId(themeId);
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  };

  const handlePointerMove = (event: PointerEvent) => {
    const draggedId = draggingId();
    if (!draggedId) return;
    const currentIndex = themes().findIndex((t) => t.id === draggedId);
    if (currentIndex === -1) return;

    let targetIndex = currentIndex;
    let closestDistance = Infinity;
    themes().forEach((t, i) => {
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
      setThemes((prev) => {
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

  // Renumbers every theme's position to match its current index and
  // saves only the ones that actually changed, so a drag that ends up
  // back in its original order makes no requests at all.
  const persistOrder = async () => {
    const current = themes();
    const updates = current
      .map((theme, index) => ({ theme, index }))
      .filter(({ theme, index }) => theme.position !== index);

    if (updates.length === 0) return;

    try {
      await Promise.all(
        updates.map(({ theme, index }) =>
          pb
            .collection("themes")
            .update<ThemeRecord>(theme.id, { position: index }),
        ),
      );
      setThemes((prev) =>
        prev.map((theme, index) => ({ ...theme, position: index })),
      );
    } catch (err) {
      console.error("[themes] failed to save theme order:", err);
    }
  };

  onCleanup(() => {
    window.removeEventListener("pointermove", handlePointerMove);
    window.removeEventListener("pointerup", handlePointerUp);
  });

  return (
    <div class="flex w-full flex-col gap-4">
      <h1 class="mb-4 font-sans text-4xl">Themes</h1>

      <ThemeForm
        hasExistingThemes={themes().length > 0}
        nextPosition={nextPosition()}
        onAdded={handleAdded}
      />
      <div class="flex flex-col gap-2">
        <For each={themes()}>
          {(theme) => (
            <ThemeItem
              theme={theme}
              onChanged={handleChanged}
              onDeleted={handleDeleted}
              rowRef={(el) => rowRefs.set(theme.id, el)}
              dragging={draggingId() === theme.id}
              onDragStart={handleDragStart(theme.id)}
            />
          )}
        </For>
      </div>
    </div>
  );
}

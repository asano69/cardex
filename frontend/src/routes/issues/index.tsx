import { createSignal, onMount, onCleanup, For } from "solid-js";

import pb from "../../lib/pb";
import IssueItem from "./IssueItem";
import IssueForm from "./IssueForm";
import type { IssueRecord } from "./IssueForm";

// Issues is a list of topics the user wants to think about: an
// add-issue input followed by the list, each with a done/not-done
// state, inline rename, drag-to-reorder, and delete. Every mutation
// (add/toggle/rename/delete/reorder) is owned by the component that
// triggers it (IssueForm/IssueItem/this page); this page only holds
// the loaded list and re-syncs it from whatever record each mutation
// reports back.
export default function Issues() {
  const [issues, setIssues] = createSignal<IssueRecord[]>([]);
  // Issue id currently being dragged, or null when nothing is dragging.
  // Drives each row's dimmed styling (see IssueItem's `dragging` prop)
  // and lets handlePointerMove know which issue to move.
  const [draggingId, setDraggingId] = createSignal<string | null>(null);
  // Plain (non-reactive) map of issue id -> row element, populated via
  // IssueItem's rowRef prop. Only used to measure row positions during
  // a drag, so it doesn't need to be a Solid store.
  const rowRefs = new Map<string, HTMLDivElement>();

  const loadIssues = async () => {
    try {
      const result = await pb
        .collection("issues")
        .getFullList<IssueRecord>({ sort: "position" });
      setIssues(result);
    } catch (err) {
      console.error("[issues] failed to load issues:", err);
    }
  };

  onMount(loadIssues);

  // Position for a newly created issue: one past the current highest
  // position, so it's always appended at the end regardless of any
  // gaps left by earlier deletes or reorders.
  const nextPosition = () =>
    issues().length === 0
      ? 0
      : Math.max(...issues().map((t) => t.position)) + 1;

  const handleAdded = (record: IssueRecord) => {
    setIssues((prev) => [...prev, record]);
  };

  const handleChanged = (record: IssueRecord) => {
    setIssues((prev) => prev.map((t) => (t.id === record.id ? record : t)));
  };

  const handleDeleted = (issue: IssueRecord) => {
    rowRefs.delete(issue.id);
    setIssues((prev) => prev.filter((t) => t.id !== issue.id));
  };

  // Drag-to-reorder: pointer events instead of native HTML5
  // drag-and-drop, so the same code handles touch (mobile) and mouse
  // (desktop). While dragging, the list is reordered live by finding
  // the row whose current midpoint is closest to the pointer. The new
  // order is only persisted to PocketBase once the drag ends.
  const handleDragStart = (issueId: string) => (event: PointerEvent) => {
    event.preventDefault();
    setDraggingId(issueId);
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  };

  const handlePointerMove = (event: PointerEvent) => {
    const draggedId = draggingId();
    if (!draggedId) return;
    const currentIndex = issues().findIndex((t) => t.id === draggedId);
    if (currentIndex === -1) return;

    let targetIndex = currentIndex;
    let closestDistance = Infinity;
    issues().forEach((t, i) => {
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
      setIssues((prev) => {
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

  // Renumbers every issue's position to match its current index and
  // saves only the ones that actually changed, so a drag that ends up
  // back in its original order makes no requests at all.
  const persistOrder = async () => {
    const current = issues();
    const updates = current
      .map((issue, index) => ({ issue, index }))
      .filter(({ issue, index }) => issue.position !== index);

    if (updates.length === 0) return;

    try {
      await Promise.all(
        updates.map(({ issue, index }) =>
          pb
            .collection("issues")
            .update<IssueRecord>(issue.id, { position: index }),
        ),
      );
      setIssues((prev) =>
        prev.map((issue, index) => ({ ...issue, position: index })),
      );
    } catch (err) {
      console.error("[issues] failed to save issue order:", err);
    }
  };

  onCleanup(() => {
    window.removeEventListener("pointermove", handlePointerMove);
    window.removeEventListener("pointerup", handlePointerUp);
  });

  return (
    <div class="flex w-full flex-col gap-4">
      <h1 class="mb-4 font-sans text-4xl">Issues</h1>

      <IssueForm
        hasExistingIssues={issues().length > 0}
        nextPosition={nextPosition()}
        onAdded={handleAdded}
      />
      <div class="flex flex-col gap-2">
        <For each={issues()}>
          {(issue) => (
            <IssueItem
              issue={issue}
              onChanged={handleChanged}
              onDeleted={handleDeleted}
              rowRef={(el) => rowRefs.set(issue.id, el)}
              dragging={draggingId() === issue.id}
              onDragStart={handleDragStart(issue.id)}
            />
          )}
        </For>
      </div>
    </div>
  );
}

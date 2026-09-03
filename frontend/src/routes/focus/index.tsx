import { createSignal, onMount, onCleanup, For, Show } from "solid-js";

import pb from "../../lib/pb";
import DateNav from "../../components/DateNav";
import FocusTaskItem from "./FocusTaskItem";
import FocusTaskForm from "./FocusTaskForm";
import FocusHeatmap from "./FocusHeatmap";
import type { FocusTaskRecord } from "./FocusTaskForm";
import { todayDate } from "../../lib/date";

const MAX_TASKS = 3;

// Focus is a minimal daily todo list: up to MAX_TASKS items for today,
// each with only a done/not-done state. No priorities, due dates, or
// editing beyond an inline rename -- the whole point is to keep the
// list short and simple. Each mutation (add/toggle/rename/delete) is
// owned by the component that triggers it (FocusTaskForm/FocusTaskItem);
// this page only holds the loaded list and re-syncs it from whatever
// record each mutation reports back.
export default function Focus() {
  const [tasks, setTasks] = createSignal<FocusTaskRecord[]>([]);
  // The day currently being viewed, defaulting to today. Navigated via
  // the chevron buttons below the title (see changeDate).
  const [selectedDate, setSelectedDate] = createSignal(todayDate());
  // Task id currently being dragged, or null when nothing is dragging.
  // Drives each row's dimmed styling (see FocusTaskItem's `dragging`
  // prop) and lets handlePointerMove know which task to move.
  const [draggingId, setDraggingId] = createSignal<string | null>(null);
  // Bumped on every add/toggle/delete so FocusHeatmap (which fetches
  // its own data independently) knows to refetch instead of showing
  // stale achievement rates.
  const [refreshKey, setRefreshKey] = createSignal(0);
  // Plain (non-reactive) map of task id -> row element, populated via
  // FocusTaskItem's rowRef prop. Only used to measure row positions
  // during a drag, so it doesn't need to be a Solid store.
  const rowRefs = new Map<string, HTMLDivElement>();

  const loadTasks = async () => {
    try {
      const result = await pb
        .collection("focus_tasks")
        .getFullList<FocusTaskRecord>({
          filter: pb.filter("date = {:date}", { date: selectedDate() }),
          sort: "position",
        });
      setTasks(result);
    } catch (err) {
      console.error("[focus] failed to load tasks:", err);
    }
  };

  onMount(loadTasks);

  // Switches the viewed day and reloads that day's tasks. Signal
  // updates apply synchronously, so loadTasks already sees the new
  // selectedDate() when it reads it.
  const handleDateChange = (date: string) => {
    setSelectedDate(date);
    loadTasks();
  };

  // Position for a newly created task: one past the current highest
  // position, so it's always appended at the end regardless of any
  // gaps left by earlier deletes or reorders.
  const nextPosition = () =>
    tasks().length === 0 ? 0 : Math.max(...tasks().map((t) => t.position)) + 1;
  const handleAdded = (record: FocusTaskRecord) => {
    setTasks((prev) => [...prev, record]);
    setRefreshKey((k) => k + 1);
  };

  const handleChanged = (record: FocusTaskRecord) => {
    setTasks((prev) => prev.map((t) => (t.id === record.id ? record : t)));
    setRefreshKey((k) => k + 1);
  };

  const handleDeleted = (task: FocusTaskRecord) => {
    rowRefs.delete(task.id);
    setTasks((prev) => prev.filter((t) => t.id !== task.id));
    setRefreshKey((k) => k + 1);
  };

  // Drag-to-reorder: pointer events instead of native HTML5
  // drag-and-drop, so the same code handles touch (mobile) and mouse
  // (desktop). While dragging, the list is reordered live by finding
  // the row whose current midpoint is closest to the pointer. The new
  // order is only persisted to PocketBase once the drag ends.
  const handleDragStart = (taskId: string) => (event: PointerEvent) => {
    event.preventDefault();
    setDraggingId(taskId);
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  };

  const handlePointerMove = (event: PointerEvent) => {
    const draggedId = draggingId();
    if (!draggedId) return;
    const currentIndex = tasks().findIndex((t) => t.id === draggedId);
    if (currentIndex === -1) return;

    let targetIndex = currentIndex;
    let closestDistance = Infinity;
    tasks().forEach((t, i) => {
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
      setTasks((prev) => {
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

  // Renumbers every task's position to match its current index and
  // saves only the ones that actually changed, so a drag that ends up
  // back in its original order makes no requests at all.
  const persistOrder = async () => {
    const current = tasks();
    const updates = current
      .map((task, index) => ({ task, index }))
      .filter(({ task, index }) => task.position !== index);

    if (updates.length === 0) return;

    try {
      await Promise.all(
        updates.map(({ task, index }) =>
          pb
            .collection("focus_tasks")
            .update<FocusTaskRecord>(task.id, { position: index }),
        ),
      );
      setTasks((prev) =>
        prev.map((task, index) => ({ ...task, position: index })),
      );
    } catch (err) {
      console.error("[focus] failed to save task order:", err);
    }
  };

  onCleanup(() => {
    window.removeEventListener("pointermove", handlePointerMove);
    window.removeEventListener("pointerup", handlePointerUp);
  });

  return (
    <div class="flex w-full flex-col gap-4">
      <DateNav date={selectedDate()} onChange={handleDateChange} />
      <h1 class="mb-4 font-sans text-4xl">Focus</h1>

      <FocusHeatmap refreshKey={refreshKey()} />
      {/* Hidden once today's 3 tasks are already registered, since
          this list is deliberately capped -- see MAX_TASKS above. */}
      <Show when={tasks().length < MAX_TASKS}>
        <FocusTaskForm
          date={selectedDate()}
          hasExistingTasks={tasks().length > 0}
          nextPosition={nextPosition()}
          onAdded={handleAdded}
        />
      </Show>
      <div class="flex flex-col gap-2">
        <For each={tasks()}>
          {(task) => (
            <FocusTaskItem
              task={task}
              onChanged={handleChanged}
              onDeleted={handleDeleted}
              rowRef={(el) => rowRefs.set(task.id, el)}
              dragging={draggingId() === task.id}
              onDragStart={handleDragStart(task.id)}
            />
          )}
        </For>
      </div>
    </div>
  );
}

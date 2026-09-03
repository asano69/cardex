import { createSignal, Show } from "solid-js";
import { TextField } from "@kobalte/core/text-field";
import { ToggleButton } from "@kobalte/core/toggle-button";
import {
  CircleCheckBig,
  Circle,
  Trash2,
  GripVertical,
} from "../../lib/icons";

import pb from "../../lib/pb";
import { playCompletionSound } from "../../lib/completionSound";
import type { FocusTaskRecord } from "./FocusTaskForm";

export interface FocusTaskItemProps {
  task: FocusTaskRecord;
  // Called with the updated record after a successful toggle or rename.
  onChanged: (record: FocusTaskRecord) => void;
  // Called with the (now-deleted) task after a successful delete.
  onDeleted: (task: FocusTaskRecord) => void;
  // Registers this row's DOM element with the parent, so it can measure
  // row positions during drag-to-reorder (see routes/focus/index.tsx).
  rowRef: (el: HTMLDivElement) => void;
  // Whether this task is the one currently being dragged.
  dragging: boolean;
  // Starts a drag-to-reorder gesture on pointerdown on the handle. The
  // parent owns the actual reordering logic, since it needs to compare
  // this row's position against every other row's.
  onDragStart: (event: PointerEvent) => void;
}

// A single row in the Focus task list: a done/not-done toggle, an
// inline-editable title (double-click to rename), and a delete button.
// Owns its own PocketBase calls and reports the result back to the
// page (see onChanged/onDeleted), so the page only has to keep its
// task list in sync rather than know about individual mutations.
export default function FocusTaskItem(props: FocusTaskItemProps) {
  const [editing, setEditing] = createSignal(false);
  const [editValue, setEditValue] = createSignal("");
  const [error, setError] = createSignal("");

  const toggleDone = async () => {
    // Captured before the update so the sound only fires on the
    // not-done -> done transition, not when un-checking a task.
    const markingDone = !props.task.done;
    try {
      const record = await pb
        .collection("focus_tasks")
        .update<FocusTaskRecord>(props.task.id, { done: markingDone });
      props.onChanged(record);
      if (markingDone) {
        playCompletionSound();
      }
    } catch {
      setError("Failed to update the task.");
    }
  };

  const handleDelete = async () => {
    try {
      await pb.collection("focus_tasks").delete(props.task.id);
      props.onDeleted(props.task);
    } catch {
      setError("Failed to delete the task.");
    }
  };

  const startEdit = () => {
    setEditValue(props.task.title);
    setEditing(true);
  };

  const cancelEdit = () => setEditing(false);

  // Commits the edited title, or just closes the editor if the value is
  // empty or unchanged (no round-trip needed in that case).
  const commitEdit = async () => {
    const newTitle = editValue().trim();
    setEditing(false);
    if (!newTitle || newTitle === props.task.title) return;
    try {
      const record = await pb
        .collection("focus_tasks")
        .update<FocusTaskRecord>(props.task.id, { title: newTitle });
      props.onChanged(record);
    } catch {
      setError("Failed to update the task.");
    }
  };

  return (
    <div
      ref={props.rowRef}
      class="flex flex-col gap-1 rounded-md border border-border bg-card p-1 shadow-card transition-opacity"
      // Dragging takes priority (opacity-40) since it needs to stand
      // out more sharply than the milder "done" fade (opacity-50).
      classList={{
        "opacity-40": props.dragging,
        "opacity-50": !props.dragging && props.task.done,
      }}
    >
      <div class="flex items-center gap-3">
        {/* Drag handle: pointer events instead of native HTML5
            drag-and-drop, so reordering works the same way with touch
            (mobile) and mouse (desktop). Actual reordering happens in
            the parent, which tracks every row's position (see
            rowRef/onDragStart above). touch-none stops the browser
            from scrolling the page while dragging on mobile. Kept
            inline in the row's normal flex flow (instead of absolutely
            positioned outside it) so it stays fully visible on narrow
            viewports, which have no room to the left of the row for it
            to sit in. -ml-2 offsets icon-btn's own padding so the icon
            still lines up close to the row's left edge. */}
        <button
          type="button"
          aria-label="Drag to reorder"
          class="icon-btn  shrink-0 cursor-grab touch-none active:cursor-grabbing"
          onPointerDown={(e) => props.onDragStart(e)}
        >
          <GripVertical size={15} />
        </button>
        {/* Kobalte ToggleButton instead of a native checkbox, so the
            done/not-done control matches the rest of the app's
            Kobalte-based inputs. */}
        {/* CircleCheckBig turns green once done, so a completed task
            is unmistakable at a glance instead of relying on the
            strikethrough title alone. Color follows Kobalte's
            data-[pressed] state, matching the [#dc3545] error-red
            convention used elsewhere in this file. */}
        <ToggleButton
          pressed={props.task.done}
          onChange={toggleDone}
          aria-label={
            props.task.done ? "Mark task as not done" : "Mark task as done"
          }
          class="flex shrink-0 items-center justify-center text-border transition-colors data-[pressed]:text-[#28a745]"
        >
          <Show when={props.task.done} fallback={<Circle size={20} />}>
            <CircleCheckBig size={20} />
          </Show>
        </ToggleButton>

        {/* Click a task's title to rename it inline, instead of a
            separate edit button/dialog. */}
        <Show
          when={editing()}
          fallback={
            <span
              class="flex-1 cursor-text border border-transparent py-2"
              onClick={startEdit}
            >
              {props.task.title}
            </span>
          }
        >
          <TextField value={editValue()} onChange={setEditValue} class="flex-1">
            <TextField.Input
              autofocus
              onBlur={commitEdit}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitEdit();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  cancelEdit();
                }
              }}
              class="w-full rounded-md border border-transparent bg-transparent py-2 text-text"
            />
          </TextField>
        </Show>

        <button
          type="button"
          aria-label="Delete task"
          class="icon-btn"
          onClick={handleDelete}
        >
          <Trash2 size={18} />
        </button>
      </div>
      {error() && <p class="text-sm text-[#dc3545]">{error()}</p>}
    </div>
  );
}

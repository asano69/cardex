import { createSignal, Show } from "solid-js";
import { A } from "@solidjs/router";
import { ToggleButton } from "@kobalte/core/toggle-button";
import {
  CircleCheckBig,
  Circle,
  Trash2,
  GripVertical,
  Pencil,
  FolderOpen,
} from "../../lib/icons";

import pb from "../../lib/pb";
import { playCompletionSound } from "../../lib/completionSound";
import PromptDialog from "../../components/dialogs/PromptDialog";
import type { ThemeRecord } from "./ThemeForm";

export interface ThemeItemProps {
  theme: ThemeRecord;
  // Called with the updated record after a successful toggle or rename.
  onChanged: (record: ThemeRecord) => void;
  // Called with the (now-deleted) theme after a successful delete.
  onDeleted: (theme: ThemeRecord) => void;
  // Registers this row's DOM element with the parent, so it can measure
  // row positions during drag-to-reorder (see routes/themes/index.tsx).
  rowRef: (el: HTMLDivElement) => void;
  // Whether this theme is the one currently being dragged.
  dragging: boolean;
  // Starts a drag-to-reorder gesture on pointerdown on the handle. The
  // parent owns the actual reordering logic, since it needs to compare
  // this row's position against every other row's.
  onDragStart: (event: PointerEvent) => void;
}

// A single row in the Themes list: a drag handle, a done/not-done
// toggle, a title, and edit/open/delete buttons. Renaming happens via
// PromptDialog (not inline) so a click on the row never accidentally
// starts an edit. Owns its own PocketBase calls and reports the result
// back to the page (see onChanged/onDeleted), so the page only has to
// keep its theme list in sync rather than know about individual
// mutations.
export default function ThemeItem(props: ThemeItemProps) {
  const [editOpen, setEditOpen] = createSignal(false);
  const [error, setError] = createSignal("");

  const toggleDone = async () => {
    // Captured before the update so the sound only fires on the
    // not-done -> done transition, not when un-checking a theme.
    const markingDone = !props.theme.done;
    try {
      const record = await pb
        .collection("themes")
        .update<ThemeRecord>(props.theme.id, { done: markingDone });
      props.onChanged(record);
      if (markingDone) {
        playCompletionSound();
      }
    } catch {
      setError("Failed to update the theme.");
    }
  };

  const handleDelete = async () => {
    try {
      await pb.collection("themes").delete(props.theme.id);
      props.onDeleted(props.theme);
    } catch {
      setError("Failed to delete the theme.");
    }
  };

  const handleEditSubmit = async (title: string) => {
    const record = await pb
      .collection("themes")
      .update<ThemeRecord>(props.theme.id, { title });
    props.onChanged(record);
  };

  return (
    <div
      ref={props.rowRef}
      class="flex flex-col gap-1 rounded-md border border-border bg-card p-1 shadow-card transition-opacity"
      // Dragging takes priority (opacity-40) since it needs to stand
      // out more sharply than the milder "done" fade (opacity-50).
      classList={{
        "opacity-40": props.dragging,
        "opacity-50": !props.dragging && props.theme.done,
      }}
    >
      <div class="flex items-center gap-3">
        {/* Drag handle: pointer events instead of native HTML5
            drag-and-drop, so reordering works the same way with touch
            (mobile) and mouse (desktop). Actual reordering happens in
            the parent, which tracks every row's position (see
            rowRef/onDragStart above). touch-none stops the browser
            from scrolling the page while dragging on mobile. */}
        <button
          type="button"
          aria-label="Drag to reorder"
          class="icon-btn shrink-0 cursor-grab touch-none active:cursor-grabbing"
          onPointerDown={(e) => props.onDragStart(e)}
        >
          <GripVertical size={15} />
        </button>
        <ToggleButton
          pressed={props.theme.done}
          onChange={toggleDone}
          aria-label={
            props.theme.done ? "Mark theme as not done" : "Mark theme as done"
          }
          class="flex shrink-0 items-center justify-center text-border transition-colors data-[pressed]:text-[#28a745]"
        >
          <Show when={props.theme.done} fallback={<Circle size={20} />}>
            <CircleCheckBig size={20} />
          </Show>
        </ToggleButton>

        <span class="flex-1 py-2">{props.theme.title}</span>
        <A
          href={`/themes/${props.theme.id}`}
          aria-label="Open theme"
          class="icon-btn"
        >
          <FolderOpen size={18} />
        </A>

        <button
          type="button"
          aria-label="Edit theme"
          class="icon-btn"
          onClick={() => setEditOpen(true)}
        >
          <Pencil size={18} />
        </button>

        {/* Opens the theme's own page, which will list its cards. */}
        <button
          type="button"
          aria-label="Delete theme"
          class="icon-btn"
          onClick={handleDelete}
        >
          <Trash2 size={18} />
        </button>
      </div>
      {error() && <p class="text-sm text-[#dc3545]">{error()}</p>}

      <PromptDialog
        open={editOpen()}
        onOpenChange={setEditOpen}
        title="Edit theme"
        label="Title"
        initialValue={props.theme.title}
        onSubmit={handleEditSubmit}
        errorMessage="Failed to update the theme."
      />
    </div>
  );
}

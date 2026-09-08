import { createSignal, Show } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { ToggleButton } from "@kobalte/core/toggle-button";
import { CircleCheckBig, Circle, Pot, Pencil } from "../../lib/icons";

import pb from "../../lib/pb";
import { playCompletionSound } from "../../lib/completionSound";
import PromptDialog from "../../components/dialogs/PromptDialog";
import type { PotRecord } from "./PotForm";

export interface PotItemProps {
  pot: PotRecord;
  // Called with the updated record after a successful toggle or rename.
  onChanged: (record: PotRecord) => void;
  // Called with the (now-deleted) pot after a successful delete.
  onDeleted: (pot: PotRecord) => void;
  // Registers this row's DOM element with the parent, so it can measure
  // row positions during drag-to-reorder (see routes/pots/index.tsx).
  rowRef: (el: HTMLDivElement) => void;
  // Whether this pot is the one currently being dragged.
  dragging: boolean;
  // Starts a drag-to-reorder gesture on pointerdown on the handle. The
  // parent owns the actual reordering logic, since it needs to compare
  // this row's position against every other row's.
  onDragStart: (event: PointerEvent) => void;
}

// A single row in the Pots list: a drag handle, a done/not-done
// toggle, a title, and edit/delete buttons. Clicking anywhere on the
// row other than those buttons opens the pot's own page (see
// handleOpen below). Renaming happens via PromptDialog (not inline) so
// a click on the row never accidentally starts an edit. Owns its own
// PocketBase calls and reports the result back to the page (see
// onChanged/onDeleted), so the page only has to keep its pot list in
// sync rather than know about individual mutations.
export default function PotItem(props: PotItemProps) {
  const navigate = useNavigate();
  const [editOpen, setEditOpen] = createSignal(false);
  const [error, setError] = createSignal("");

  // Opens the pot's own page, which will list its cards. Bound to
  // the whole row (see the outer <div>'s onClick below); every
  // interactive child (drag handle, toggle, edit, delete) stops this
  // from firing via stopPropagation.
  const handleOpen = () => navigate(`/${props.pot.slug}`);

  const toggleDone = async () => {
    // Captured before the update so the sound only fires on the
    // not-done -> done transition, not when un-checking a pot.
    const markingDone = !props.pot.done;
    try {
      const record = await pb
        .collection("pots")
        .update<PotRecord>(props.pot.id, { done: markingDone });
      props.onChanged(record);
      if (markingDone) {
        playCompletionSound();
      }
    } catch {
      setError("Failed to update the pot.");
    }
  };

  const handleDelete = async () => {
    try {
      await pb.collection("pots").delete(props.pot.id);
      props.onDeleted(props.pot);
    } catch {
      setError("Failed to delete the pot.");
    }
  };

  const handleEditSubmit = async (title: string) => {
    const record = await pb
      .collection("pots")
      .update<PotRecord>(props.pot.id, { title });
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
        "opacity-50": !props.dragging && props.pot.done,
      }}
      onClick={handleOpen}
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
          onClick={(e) => e.stopPropagation()}
        >
          <Pot size={15} />
        </button>
        <ToggleButton
          pressed={props.pot.done}
          onChange={toggleDone}
          aria-label={
            props.pot.done ? "Mark pot as not done" : "Mark pot as done"
          }
          class="flex shrink-0 items-center justify-center text-border transition-colors data-[pressed]:text-[#28a745]"
          onClick={(e: MouseEvent) => e.stopPropagation()}
        >
          <Show when={props.pot.done} fallback={<Circle size={20} />}>
            <CircleCheckBig size={20} />
          </Show>
        </ToggleButton>

        <span class="flex-1 py-2">{props.pot.title}</span>

        <button
          type="button"
          aria-label="Edit pot"
          class="icon-btn"
          onClick={(e) => {
            e.stopPropagation();
            setEditOpen(true);
          }}
        >
          <Pencil size={18} />
        </button>
      </div>
      {error() && <p class="text-sm text-[#dc3545]">{error()}</p>}

      <PromptDialog
        open={editOpen()}
        onOpenChange={setEditOpen}
        title="Edit pot"
        label="Title"
        initialValue={props.pot.title}
        onSubmit={handleEditSubmit}
        errorMessage="Failed to update the pot."
      />
    </div>
  );
}

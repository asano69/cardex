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
import type { IssueRecord } from "./IssueForm";

export interface IssueItemProps {
  issue: IssueRecord;
  // Called with the updated record after a successful toggle or rename.
  onChanged: (record: IssueRecord) => void;
  // Called with the (now-deleted) issue after a successful delete.
  onDeleted: (issue: IssueRecord) => void;
  // Registers this row's DOM element with the parent, so it can measure
  // row positions during drag-to-reorder (see routes/issues/index.tsx).
  rowRef: (el: HTMLDivElement) => void;
  // Whether this issue is the one currently being dragged.
  dragging: boolean;
  // Starts a drag-to-reorder gesture on pointerdown on the handle. The
  // parent owns the actual reordering logic, since it needs to compare
  // this row's position against every other row's.
  onDragStart: (event: PointerEvent) => void;
}

// A single row in the Issues list: a drag handle, a done/not-done
// toggle, a title, and edit/open/delete buttons. Renaming happens via
// PromptDialog (not inline) so a click on the row never accidentally
// starts an edit. Owns its own PocketBase calls and reports the result
// back to the page (see onChanged/onDeleted), so the page only has to
// keep its issue list in sync rather than know about individual
// mutations.
export default function IssueItem(props: IssueItemProps) {
  const [editOpen, setEditOpen] = createSignal(false);
  const [error, setError] = createSignal("");

  const toggleDone = async () => {
    // Captured before the update so the sound only fires on the
    // not-done -> done transition, not when un-checking a issue.
    const markingDone = !props.issue.done;
    try {
      const record = await pb
        .collection("issues")
        .update<IssueRecord>(props.issue.id, { done: markingDone });
      props.onChanged(record);
      if (markingDone) {
        playCompletionSound();
      }
    } catch {
      setError("Failed to update the issue.");
    }
  };

  const handleDelete = async () => {
    try {
      await pb.collection("issues").delete(props.issue.id);
      props.onDeleted(props.issue);
    } catch {
      setError("Failed to delete the issue.");
    }
  };

  const handleEditSubmit = async (title: string) => {
    const record = await pb
      .collection("issues")
      .update<IssueRecord>(props.issue.id, { title });
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
        "opacity-50": !props.dragging && props.issue.done,
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
          pressed={props.issue.done}
          onChange={toggleDone}
          aria-label={
            props.issue.done ? "Mark issue as not done" : "Mark issue as done"
          }
          class="flex shrink-0 items-center justify-center text-border transition-colors data-[pressed]:text-[#28a745]"
        >
          <Show when={props.issue.done} fallback={<Circle size={20} />}>
            <CircleCheckBig size={20} />
          </Show>
        </ToggleButton>

        <span class="flex-1 py-2">{props.issue.title}</span>
        <A
          href={`/issues/${props.issue.id}`}
          aria-label="Open issue"
          class="icon-btn"
        >
          <FolderOpen size={18} />
        </A>

        <button
          type="button"
          aria-label="Edit issue"
          class="icon-btn"
          onClick={() => setEditOpen(true)}
        >
          <Pencil size={18} />
        </button>

        {/* Opens the issue's own page, which will list its cards. */}
        <button
          type="button"
          aria-label="Delete issue"
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
        title="Edit issue"
        label="Title"
        initialValue={props.issue.title}
        onSubmit={handleEditSubmit}
        errorMessage="Failed to update the issue."
      />
    </div>
  );
}

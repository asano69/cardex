import { createSignal, Show } from "solid-js";
import { TextField } from "@kobalte/core/text-field";
import { ToggleButton } from "@kobalte/core/toggle-button";
import { CircleCheckBig, Circle, Trash2 } from "../../lib/icons";

import pb from "../../lib/pb";
import { playCompletionSound } from "../../lib/completionSound";
import type { ThemeRecord } from "./ThemeForm";

export interface ThemeItemProps {
  theme: ThemeRecord;
  // Called with the updated record after a successful toggle or rename.
  onChanged: (record: ThemeRecord) => void;
  // Called with the (now-deleted) theme after a successful delete.
  onDeleted: (theme: ThemeRecord) => void;
}

// A single row in the Themes list: a done/not-done toggle, an
// inline-editable title (click to rename), and a delete button. Owns
// its own PocketBase calls and reports the result back to the page
// (see onChanged/onDeleted), so the page only has to keep its theme
// list in sync rather than know about individual mutations.
export default function ThemeItem(props: ThemeItemProps) {
  const [editing, setEditing] = createSignal(false);
  const [editValue, setEditValue] = createSignal("");
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

  const startEdit = () => {
    setEditValue(props.theme.title);
    setEditing(true);
  };

  const cancelEdit = () => setEditing(false);

  // Commits the edited title, or just closes the editor if the value is
  // empty or unchanged (no round-trip needed in that case).
  const commitEdit = async () => {
    const newTitle = editValue().trim();
    setEditing(false);
    if (!newTitle || newTitle === props.theme.title) return;
    try {
      const record = await pb
        .collection("themes")
        .update<ThemeRecord>(props.theme.id, { title: newTitle });
      props.onChanged(record);
    } catch {
      setError("Failed to update the theme.");
    }
  };

  return (
    <div
      class="flex flex-col gap-1 rounded-md border border-border bg-card p-1 shadow-card transition-opacity"
      classList={{ "opacity-50": props.theme.done }}
    >
      <div class="flex items-center gap-3">
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

        {/* Click a theme's title to rename it inline, instead of a
            separate edit button/dialog. */}
        <Show
          when={editing()}
          fallback={
            <span
              class="flex-1 cursor-text border border-transparent py-2"
              onClick={startEdit}
            >
              {props.theme.title}
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
          aria-label="Delete theme"
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

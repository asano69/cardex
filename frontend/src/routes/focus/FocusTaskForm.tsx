import { createSignal } from "solid-js";
import { TextField } from "@kobalte/core/text-field";
import { Plus } from "../../lib/icons";

import pb from "../../lib/pb";

// Matches the PocketBase "focus_tasks" collection schema.
export interface FocusTaskRecord {
  id: string;
  date: string; // "YYYY-MM-DD"
  title: string;
  done: boolean;
  position: number;
  created: string;
  updated: string;
}

export interface FocusTaskFormProps {
  date: string;
  // Whether at least one task already exists for `date` -- tones down
  // the input's styling once the list isn't empty, so it reads as an
  // optional affordance rather than a prompt nagging the user to fill
  // the list (see classList below).
  hasExistingTasks: boolean;
  // Position to store on the new task, so it's appended after every
  // existing task regardless of any gaps left by deleting or
  // reordering earlier tasks (see routes/focus/index.tsx).
  nextPosition: number;
  onAdded: (record: FocusTaskRecord) => void;
}

// Add-task input for the Focus page. Saves directly to PocketBase's
// "focus_tasks" collection and reports the created record back via
// onAdded, since the page owns the actual task list.
export default function FocusTaskForm(props: FocusTaskFormProps) {
  const [title, setTitle] = createSignal("");
  const [submitting, setSubmitting] = createSignal(false);
  const [error, setError] = createSignal("");

  const handleSubmit = async (e: SubmitEvent) => {
    e.preventDefault();
    if (!title().trim()) return;
    setError("");
    setSubmitting(true);
    try {
      const record = await pb
        .collection("focus_tasks")
        .create<FocusTaskRecord>({
          date: props.date,
          title: title().trim(),
          done: false,
          position: props.nextPosition,
        });
      props.onAdded(record);
      setTitle("");
    } catch {
      setError("Failed to add the task.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {/* focus-within restores full opacity while actually typing. */}
      <form
        onSubmit={handleSubmit}
        class="flex items-center gap-2 transition-opacity focus-within:opacity-100"
        classList={{ "opacity-50": props.hasExistingTasks }}
      >
        <TextField value={title()} onChange={setTitle} class="flex-1">
          <TextField.Input
            placeholder="What do you want to get done today?"
            class="w-full rounded-md border border-border bg-field px-3 py-2 text-text"
            classList={{
              "border-transparent bg-transparent px-0": props.hasExistingTasks,
            }}
          />
        </TextField>
        {/* Plus icon instead of an "Add" label, symmetric with the
            Trash2 delete button on each task row. */}
        <button
          type="submit"
          aria-label={submitting() ? "Adding…" : "Add task"}
          class="icon-btn shrink-0"
          disabled={submitting()}
        >
          <Plus size={20} />
        </button>
      </form>
      {error() && <p class="text-sm text-[#dc3545]">{error()}</p>}
    </>
  );
}

import { createSignal } from "solid-js";
import { TextField } from "@kobalte/core/text-field";
import { Plus } from "../../lib/icons";

import pb from "../../lib/pb";

// Matches the PocketBase "themes" collection schema.
export interface ThemeRecord {
  id: string;
  title: string;
  done: boolean;
  position: number;
  created: string;
  updated: string;
}

export interface ThemeFormProps {
  // Whether at least one theme already exists -- tones down the
  // input's styling once the list isn't empty, so it reads as an
  // optional affordance rather than a prompt nagging the user to fill
  // the list.
  hasExistingThemes: boolean;
  // Position to store on the new theme, so it's appended after every
  // existing theme regardless of any gaps left by earlier deletes.
  nextPosition: number;
  onAdded: (record: ThemeRecord) => void;
}

// Add-theme input for the Themes page. Saves directly to PocketBase's
// "themes" collection and reports the created record back via onAdded,
// since the page owns the actual theme list.
export default function ThemeForm(props: ThemeFormProps) {
  const [title, setTitle] = createSignal("");
  const [submitting, setSubmitting] = createSignal(false);
  const [error, setError] = createSignal("");

  const handleSubmit = async (e: SubmitEvent) => {
    e.preventDefault();
    if (!title().trim()) return;
    setError("");
    setSubmitting(true);
    try {
      const record = await pb.collection("themes").create<ThemeRecord>({
        title: title().trim(),
        done: false,
        position: props.nextPosition,
      });
      props.onAdded(record);
      setTitle("");
    } catch {
      setError("Failed to add the theme.");
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
        classList={{ "opacity-50": props.hasExistingThemes }}
      >
        <TextField value={title()} onChange={setTitle} class="flex-1">
          <TextField.Input
            placeholder="What theme do you want to think about?"
            class="w-full rounded-md border border-border bg-field px-3 py-2 text-text"
            classList={{
              "border-transparent bg-transparent px-0": props.hasExistingThemes,
            }}
          />
        </TextField>
        {/* Plus icon instead of an "Add" label, matching the delete
            icon on each theme row. */}
        <button
          type="submit"
          aria-label={submitting() ? "Adding…" : "Add theme"}
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

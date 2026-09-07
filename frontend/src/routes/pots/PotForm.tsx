import { createSignal } from "solid-js";
import { TextField } from "@kobalte/core/text-field";
import { Plus } from "../../lib/icons";

import pb from "../../lib/pb";
import { randomKey } from "../../lib/randomKey";

// Matches the PocketBase "pots" collection schema.
export interface PotRecord {
  id: string;
  slug: string;
  title: string;
  done: boolean;
  position: number;
  created: string;
  updated: string;
}

export interface PotFormProps {
  // Whether at least one pot already exists -- tones down the
  // input's styling once the list isn't empty, so it reads as an
  // optional affordance rather than a prompt nagging the user to fill
  // the list.
  hasExistingPots: boolean;
  // Position to store on the new pot, so it's appended after every
  // existing pot regardless of any gaps left by earlier deletes.
  nextPosition: number;
  onAdded: (record: PotRecord) => void;
}

// Add-pot input for the Pots page. Saves directly to PocketBase's
// "pots" collection and reports the created record back via onAdded,
// since the page owns the actual pot list.
export default function PotForm(props: PotFormProps) {
  const [title, setTitle] = createSignal("");
  const [submitting, setSubmitting] = createSignal(false);
  const [error, setError] = createSignal("");

  const handleSubmit = async (e: SubmitEvent) => {
    e.preventDefault();
    if (!title().trim()) return;
    setError("");
    setSubmitting(true);
    try {
      // The "slug" field is required and pattern-constrained, but the
      // real id isn't known until after creation -- so this creates
      // with a throwaway placeholder value (satisfying both the
      // required and pattern rules) first, then immediately overwrites
      // it with the record's own id (see the update call below). No
      // slug-picking UI exists yet; this can be replaced with a real,
      // user-chosen slug once that UI exists.
      const record = await pb.collection("pots").create<PotRecord>({
        title: title().trim(),
        done: false,
        position: props.nextPosition,
        slug: randomKey(),
      });
      const withSlug = await pb
        .collection("pots")
        .update<PotRecord>(record.id, { slug: record.id });
      props.onAdded(withSlug);
      setTitle("");
    } catch {
      setError("Failed to add the pot.");
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
        classList={{ "opacity-50": props.hasExistingPots }}
      >
        <TextField value={title()} onChange={setTitle} class="flex-1">
          <TextField.Input
            placeholder="What pot do you want to think about?"
            class="w-full rounded-md border border-border bg-field px-3 py-2 text-text"
            classList={{
              "border-transparent bg-transparent px-0": props.hasExistingPots,
            }}
          />
        </TextField>
        {/* Plus icon instead of an "Add" label, matching the delete
            icon on each pot row. */}
        <button
          type="submit"
          aria-label={submitting() ? "Adding…" : "Add pot"}
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

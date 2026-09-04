import { createSignal } from "solid-js";
import { useParams, useNavigate } from "@solidjs/router";
import { TextField } from "@kobalte/core/text-field";

import pb from "../../lib/pb";
import SaveButton from "../../components/SaveButton";

// Matches the PocketBase "cards" collection schema.
export interface CardRecord {
  id: string;
  content: string;
  theme: string;
  kind: "quote" | "idea";
  created: string;
  updated: string;
}

// Add-card page, reached from ThemeDetail's "add card" button. Creates a
// single card linked to the theme in the route (:id) using a plain
// Kobalte textarea. This page always creates a new card (never edits an
// existing one), so there is no record to load first.
export default function CardForm() {
  const params = useParams();
  const navigate = useNavigate();

  const [title, setTitle] = createSignal("");
  const [content, setContent] = createSignal("");
  const [kind, setKind] = createSignal<CardRecord["kind"]>("idea");
  const [saving, setSaving] = createSignal(false);
  const [error, setError] = createSignal("");

  const handleSave = async (e: SubmitEvent) => {
    e.preventDefault();
    if (!title().trim() || !content().trim()) return;
    setError("");
    setSaving(true);
    try {
      await pb.collection("cards").create<CardRecord>({
        title: title().trim(),
        content: content().trim(),
        theme: params.id,
        kind: kind(),
      });
      navigate(`/themes/${params.id}`);
    } catch {
      setError("Failed to add the card.");
      setSaving(false);
    }
  };

  return (
    <form
      onSubmit={handleSave}
      class="flex min-h-0 flex-1 w-full flex-col gap-4 mb-20"
    >
      <h1 class="font-sans text-4xl">Add card</h1>

      <TextField
        value={title()}
        onChange={setTitle}
        class="flex flex-col gap-1"
      >
        <TextField.Label class="text-sm text-text">Title</TextField.Label>
        <TextField.Input
          autofocus
          class="w-full rounded-md border border-border bg-field px-3 py-2 text-text"
        />
      </TextField>

      <div role="radiogroup" aria-label="Kind" class="flex gap-4">
        <label class="flex items-center gap-1.5">
          <input
            type="radio"
            name="kind"
            value="idea"
            checked={kind() === "idea"}
            onChange={() => setKind("idea")}
          />
          Idea
        </label>
        <label class="flex items-center gap-1.5">
          <input
            type="radio"
            name="kind"
            value="quote"
            checked={kind() === "quote"}
            onChange={() => setKind("quote")}
          />
          Quote
        </label>
      </div>

      <TextField
        value={content()}
        onChange={setContent}
        class="flex flex-1 flex-col gap-1"
      >
        <TextField.TextArea class="min-h-0 flex-1 resize-none rounded-md border border-border bg-field p-3 text-text" />
      </TextField>

      {error() && <p class="text-sm text-[#dc3545]">{error()}</p>}
      <SaveButton
        saving={saving()}
        justSaved={false}
        dirty={title().trim() !== "" && content().trim() !== ""}
      />
    </form>
  );
}

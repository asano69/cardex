import { createResource, createSignal, Show } from "solid-js";
import { useParams, useNavigate } from "@solidjs/router";
import { TextField } from "@kobalte/core/text-field";

import pb from "../../lib/pb";
import SaveButton from "../../components/SaveButton";
import Loading from "../../components/Loading";

// Matches the PocketBase "cards" collection schema.
export interface CardRecord {
  id: string;
  title: string;
  content: string;
  theme: string;
  kind: "quote" | "idea";
  created: string;
  updated: string;
}

async function fetchCard(id: string): Promise<CardRecord> {
  return await pb.collection("cards").getOne<CardRecord>(id);
}

// Add/edit page for a single card, reached from ThemeDetail's "add card"
// button (create, at /themes/:id/cards/new) or by clicking a card
// (edit, at /themes/:id/cards/:cardId). Both modes share the same form
// below; params.cardId being present is what selects edit mode.
export default function CardForm() {
  const params = useParams();
  const [existing] = createResource(() => params.cardId, fetchCard);

  return (
    <Show when={!params.cardId || !existing.loading} fallback={<Loading />}>
      <CardFields
        themeId={params.id}
        cardId={params.cardId}
        card={existing()}
      />
    </Show>
  );
}

interface CardFieldsProps {
  themeId: string;
  cardId?: string;
  card?: CardRecord;
}

// Split out from CardForm so a fresh set of signals is created once the
// existing card (if any) has finished loading -- the same pattern Diary
// uses for its own form (see routes/diary/index.tsx's DiaryForm).
function CardFields(props: CardFieldsProps) {
  const navigate = useNavigate();

  const [title, setTitle] = createSignal(props.card?.title ?? "");
  const [content, setContent] = createSignal(props.card?.content ?? "");
  const [kind, setKind] = createSignal<CardRecord["kind"]>(
    props.card?.kind ?? "idea",
  );
  const [saving, setSaving] = createSignal(false);
  const [error, setError] = createSignal("");

  const handleSave = async (e: SubmitEvent) => {
    e.preventDefault();
    if (!title().trim() || !content().trim()) return;
    setError("");
    setSaving(true);
    try {
      const data = {
        title: title().trim(),
        content: content().trim(),
        theme: props.themeId,
        kind: kind(),
      };
      if (props.cardId) {
        await pb.collection("cards").update<CardRecord>(props.cardId, data);
      } else {
        await pb.collection("cards").create<CardRecord>(data);
      }
      navigate(`/themes/${props.themeId}`);
    } catch {
      setError(
        props.cardId ? "Failed to update the card." : "Failed to add the card.",
      );
      setSaving(false);
    }
  };

  return (
    <form
      onSubmit={handleSave}
      class="flex min-h-0 flex-1 w-full flex-col gap-4 mb-20"
    >
      <h1 class="font-sans text-4xl">
        {props.cardId ? "Edit card" : "Add card"}
      </h1>

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

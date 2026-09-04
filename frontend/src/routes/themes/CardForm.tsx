import { createResource, Show } from "solid-js";
import { useParams, useNavigate } from "@solidjs/router";

import pb from "../../lib/pb";
import NoteEditor from "../../components/noteEditor";
import Loading from "../../components/Loading";

// Matches the PocketBase "cards" collection schema.
export interface CardRecord {
  id: string;
  title: string;
  content: string;
  theme: string;
  created: string;
  updated: string;
}

async function fetchCard(id: string): Promise<CardRecord> {
  return await pb.collection("cards").getOne<CardRecord>(id);
}

// Add/edit page for a single card, reached from ThemeDetail's "add card"
// button (create, at /themes/:id/cards/new) or by clicking a card
// (edit, at /themes/:id/cards/:cardId). Both modes share the same
// NoteEditor; params.cardId being present is what selects edit mode.
export default function CardForm() {
  const params = useParams();
  const navigate = useNavigate();
  const [existing] = createResource(() => params.cardId, fetchCard);

  const handleSave = async (data: { title: string; content: string }) => {
    if (params.cardId) {
      await pb.collection("cards").update<CardRecord>(params.cardId, data);
    } else {
      await pb
        .collection("cards")
        .create<CardRecord>({ ...data, theme: params.id });
    }
    navigate(`/themes/${params.id}`);
  };

  return (
    <Show when={!params.cardId || !existing.loading} fallback={<Loading />}>
      <NoteEditor
        initialTitle={existing()?.title}
        initialContent={existing()?.content}
        onSave={handleSave}
        errorMessage={
          params.cardId
            ? "Failed to update the card."
            : "Failed to add the card."
        }
      />
    </Show>
  );
}

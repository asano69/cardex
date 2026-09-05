import { createResource, createSignal, Show } from "solid-js";
import { useParams, useNavigate } from "@solidjs/router";

import pb from "../../lib/pb";
import NoteEditor from "../../components/noteEditor";
import Loading from "../../components/Loading";

// Matches the PocketBase "cards" collection schema. "preview" is a
// short plain-text preview computed server-side from the card's live
// Yjs body (see internal/serve/ydoc.go's buildPreview) -- the full body
// itself is never stored here, only in the live Yjs room (see
// NoteEditor.tsx).
export interface CardRecord {
  id: string;
  title: string;
  preview: string;
  issue: string;
  created: string;
  updated: string;
}

async function fetchCard(id: string): Promise<CardRecord> {
  return await pb.collection("cards").getOne<CardRecord>(id);
}

// Add/edit page for a single card, reached from IssueDetail's "add card"
// button (create, at /issues/:id/cards/new) or by clicking a card
// (edit, at /issues/:id/cards/:cardId). Both modes share the same
// NoteEditor, which autosaves on every edit; params.cardId being
// present is what selects edit mode initially.
export default function CardForm() {
  const params = useParams();
  const navigate = useNavigate();
  const [existing] = createResource(() => params.cardId, fetchCard);

  // Tracks the record once it exists, so a brand-new card (no
  // params.cardId) switches from create to update after its first
  // autosave, without needing a page reload in between.
  // Tracks the record once it exists, so a brand-new card (no
  // params.cardId) switches into edit mode after its first title save,
  // without needing a page reload in between. Also doubles as
  // NoteEditor's Yjs room id -- see NoteEditor's cardId prop.
  const [recordId, setRecordId] = createSignal(params.cardId);

  const handleSaveTitle = async (title: string) => {
    const id = recordId();
    if (id) {
      await pb.collection("cards").update<CardRecord>(id, { title });
      return;
    }
    const record = await pb
      .collection("cards")
      .create<CardRecord>({ title, issue: params.id });
    setRecordId(record.id);
    // Swap the URL to the edit route so a refresh or the back button
    // lands on the now-existing card instead of the "new" route.
    navigate(`/issues/${params.id}/cards/${record.id}`, { replace: true });
  };

  return (
    <Show when={!params.cardId || !existing.loading} fallback={<Loading />}>
      <NoteEditor
        initialTitle={existing()?.title}
        cardId={recordId}
        onSaveTitle={handleSaveTitle}
      />
    </Show>
  );
}

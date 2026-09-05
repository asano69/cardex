import { createResource, createSignal, createMemo, Show } from "solid-js";
import { useParams, useNavigate } from "@solidjs/router";

import pb from "../../lib/pb";
import NoteEditor from "../../components/noteEditor";
import Loading from "../../components/Loading";
import { cardsById, mergeCards } from "../../lib/cardsStore";

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

// Fetches once and seeds the shared cards store (see lib/cardsStore.ts),
// so this page's title reads from the same live-updated source as
// IssueDetail's card grid instead of a page-local snapshot.
async function fetchCard(id: string): Promise<void> {
  const record = await pb.collection("cards").getOne<CardRecord>(id);
  mergeCards([record]);
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
  // params.cardId) switches into edit mode after its first title save,
  // without needing a page reload in between. Also doubles as
  // NoteEditor's Yjs room id -- see NoteEditor's cardId prop.
  const [recordId, setRecordId] = createSignal(params.cardId);

  // Derived from the shared cards store (see lib/cardsStore.ts) -- the
  // same store IssueDetail's card grid reads from. AppShell's realtime
  // subscription stays alive across route changes, so another user's
  // title edit lands here automatically; no page-local subscription
  // needed.
  const card = createMemo(() => {
    const id = recordId();
    return id ? cardsById[id] : undefined;
  });

  const handleSaveTitle = async (title: string) => {
    const id = recordId();
    if (id) {
      const record = await pb
        .collection("cards")
        .update<CardRecord>(id, { title });
      mergeCards([record]);
      return;
    }
    const record = await pb
      .collection("cards")
      .create<CardRecord>({ title, issue: params.id });
    mergeCards([record]);
    setRecordId(record.id);
    // Swap the URL to the edit route so a refresh or the back button
    // lands on the now-existing card instead of the "new" route.
    navigate(`/issues/${params.id}/cards/${record.id}`, { replace: true });
  };

  return (
    <Show when={!params.cardId || !existing.loading} fallback={<Loading />}>
      <NoteEditor
        title={() => card()?.title}
        cardId={recordId}
        onSaveTitle={handleSaveTitle}
      />
    </Show>
  );
}

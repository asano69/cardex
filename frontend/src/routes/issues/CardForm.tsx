import { onMount, createSignal, Show } from "solid-js";
import { useParams, useNavigate } from "@solidjs/router";

import pb from "../../lib/pb";
import NoteEditor from "../../components/noteEditor";
import Loading from "../../components/Loading";
import { Trash2 } from "../../lib/icons";

// Matches the PocketBase "cards" collection schema. "title" and
// "preview" are both derived server-side from the card's live Yjs body
// (see internal/serve/ydoc.go) -- the body itself is never stored here,
// only in the live Yjs room (see components/noteEditor). There is no
// UI path that sets "title" directly anymore: it's always whatever the
// first line of the body says.
export interface CardRecord {
  id: string;
  title: string;
  preview: string;
  issue: string;
  created: string;
  updated: string;
}

// Add/edit page for a single card, reached from IssueDetail's "add card"
// button (create, at /issues/:id/cards/new) or by clicking a card
// (edit, at /issues/:id/cards/:cardId). A brand-new card's PocketBase
// record is created immediately on mount, purely so its Yjs room has
// somewhere to persist to (see NoteEditor) -- title and body both live
// entirely in that room from then on, so there's nothing left to fill
// in before writing can start. This does mean navigating to "new" and
// leaving without typing anything leaves behind an empty card; that's
// an accepted trade-off for letting the title stay optional.
export default function CardForm() {
  const params = useParams();
  const navigate = useNavigate();

  const [recordId, setRecordId] = createSignal(params.cardId ?? "");
  const [creating, setCreating] = createSignal(!params.cardId);

  onMount(async () => {
    if (params.cardId) return;
    const record = await pb
      .collection("cards")
      .create<CardRecord>({ title: "", issue: params.id });
    setRecordId(record.id);
    setCreating(false);
    // Swap the URL to the edit route so a refresh or the back button
    // lands on the now-existing card instead of the "new" route. Uses
    // history.replaceState directly (not solid-router's navigate) so
    // only the URL bar changes -- navigate() would match a different
    // Route pattern (see router.tsx) and remount this whole component,
    // which would tear down and reconnect the Yjs room mid-edit.
    history.replaceState(null, "", `/issues/${params.id}/cards/${record.id}`);
  });

  // Cascade deletion of the card's card_blocks/ydoc_updates records and
  // its in-memory Yjs room is already handled server-side (see
  // migrations/1788596608_collections_snapshot.go's cascadeDelete and
  // internal/serve/ydoc.go's forgetRoom), so this only needs to delete
  // the "cards" record itself.
  const handleDelete = async () => {
    const id = recordId();
    if (!id) return;
    await pb.collection("cards").delete(id);
    navigate(`/issues/${params.id}`);
  };

  return (
    <Show when={!creating()} fallback={<Loading />}>
      {/* Layout for a card-editing screen: the editor plus a delete
          button beside it. NoteEditor itself stays layout-agnostic so
          it can be reused without this app's card-specific chrome. */}
      <div class="m-6 flex min-h-0 flex-1 items-start gap-2">
        <NoteEditor cardId={recordId} />
        <button
          type="button"
          aria-label="Delete card"
          class="icon-btn shrink-0"
          onClick={handleDelete}
        >
          <Trash2 size={20} />
        </button>
      </div>
    </Show>
  );
}

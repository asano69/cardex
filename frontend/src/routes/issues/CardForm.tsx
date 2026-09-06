import { onMount, createSignal, createEffect, Show } from "solid-js";
import { useParams, useNavigate, A } from "@solidjs/router";

import pb from "../../lib/pb";
import NoteEditor from "../../components/noteEditor";
import Loading from "../../components/Loading";
import { Trash2, Pin, PinOff } from "../../lib/icons";
import { POSITION_STEP } from "../../lib/position";
import { cardsById, mergeCards } from "../../lib/cardsStore";
import { cardTitleToSegment, segmentToCardTitle } from "../../lib/cardSlug";

// Matches the PocketBase "cards" collection schema. "title" and
// "preview" are both derived server-side from the card's live Yjs body
// (see internal/serve/ydoc.go) -- the body itself is never stored here,
// only in the live Yjs room (see components/noteEditor). "position" is
// a fractional-indexing sort key (see lib/position.ts) used to persist
// the tile grid's drag-to-reorder order in IssueDetail.
export interface CardRecord {
  id: string;
  title: string;
  preview: string;
  issue: string;
  position: number;
  pin: boolean;
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

  const [recordId, setRecordId] = createSignal("");
  const [notFound, setNotFound] = createSignal(false);

  onMount(async () => {
    if (params.cardTitle) {
      // Editing an existing card: its PocketBase id isn't in the URL
      // anymore, so it's resolved by matching the decoded title within
      // this issue. Titles are unique within an issue (enforced at the
      // database level), so this lookup returns at most one record.
      try {
        const record = await pb
          .collection("cards")
          .getFirstListItem<CardRecord>(
            pb.filter("issue = {:issue} && title = {:title}", {
              issue: params.id,
              title: segmentToCardTitle(params.cardTitle),
            }),
          );
        mergeCards([record]);
        setRecordId(record.id);
      } catch {
        setNotFound(true);
      }
      return;
    }

    // New cards get the current highest position + POSITION_STEP (see
    // lib/position.ts), which puts them first in IssueDetail's
    // descending-sorted card grid. Only the current highest position
    // is fetched here -- never the full card list -- so this stays
    // cheap regardless of how many thousands of cards the issue holds.
    const existing = await pb.collection("cards").getList<CardRecord>(1, 1, {
      filter: pb.filter("issue = {:issue}", { issue: params.id }),
      sort: "-position",
    });
    const position = (existing.items[0]?.position ?? 0) + POSITION_STEP;
    const record = await pb
      .collection("cards")
      .create<CardRecord>({ title: "", issue: params.id, position });
    mergeCards([record]);
    setRecordId(record.id);
  });

  // Keeps the address bar's title segment in sync as the card's title
  // changes server-side (see internal/serve/ydoc.go, which derives it
  // from the editor's live content). Only the URL is swapped, the same
  // way the "new" -> edit transition above used to be -- see that
  // comment for why history.replaceState is used directly instead of
  // navigate().
  let urlSegment = params.cardTitle ?? "";
  createEffect(() => {
    const id = recordId();
    if (!id) return;
    const segment = cardTitleToSegment(cardsById[id]?.title ?? "");
    if (segment === urlSegment) return;
    urlSegment = segment;
    history.replaceState(null, "", `/issues/${params.id}/${segment}`);
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

  // Whether this card is currently pinned, read from the shared cards
  // store (see lib/cardsStore.ts) so it stays in sync with IssueDetail's
  // grid ordering and with other users' edits, instead of tracking a
  // separate local copy.
  const pinned = () => cardsById[recordId()]?.pin ?? false;

  const togglePin = async () => {
    const id = recordId();
    if (!id) return;
    try {
      const updated = await pb
        .collection("cards")
        .update<CardRecord>(id, { pin: !pinned() });
      mergeCards([updated]);
    } catch {
      // Best-effort: if this fails the pin state simply doesn't change.
    }
  };

  return (
    <Show
      when={!notFound()}
      fallback={
        <div class="flex flex-col items-center gap-2 py-12 text-text">
          <p>Card not found.</p>
          <A href={`/issues/${params.id}`} class="underline">
            Back to issue
          </A>
        </div>
      }
    >
      <Show when={recordId()} fallback={<Loading />}>
        {/* Layout for a card-editing screen: pin/delete icons above the
            editor. NoteEditor itself stays layout-agnostic so it can be
            reused without this app's card-specific chrome. */}
        <div class="flex flex-col">
        <div class="flex justify-end gap-2">
          <button
            type="button"
            aria-label={pinned() ? "Unpin card" : "Pin card"}
            class="icon-btn shrink-0"
            onClick={togglePin}
          >
            <Show when={pinned()} fallback={<Pin size={20} />}>
              <PinOff size={20} />
            </Show>
          </button>
          <button
            type="button"
            aria-label="Delete card"
            class="icon-btn shrink-0"
            onClick={handleDelete}
          >
            <Trash2 size={20} />
          </button>
        </div>
          <NoteEditor cardId={recordId} />
        </div>
      </Show>
    </Show>
  );
}

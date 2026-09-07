import { onMount, createSignal, createResource, createEffect, Show } from "solid-js";
import { useParams, useNavigate, A } from "@solidjs/router";

import pb from "../../lib/pb";
import NoteEditor from "../../components/noteEditor";
import Loading from "../../components/Loading";
import { Trash2, Pin, PinOff } from "../../lib/icons";
import { cardsById, mergeCards } from "../../lib/cardsStore";
import { cardSlugToSegment, segmentToCardSlug } from "../../lib/cardSlug";
import { fetchIssueBySlug } from "../../lib/issues";
import { useTitle } from "../../lib/useTitle";

// Matches the PocketBase "cards" collection schema. "title" is a
// display label derived server-side from the card's live Yjs body
// (see internal/serve/ydoc.go); "slug" is the URL identifier, resolved
// server-side from the same source via a dedicated route (see
// internal/serve/cards.go and lib/cardApi.ts) instead of doubling as
// the title. "position" is a fractional-indexing sort key (see
// lib/position.ts) used to persist the tile grid's drag-to-reorder
// order in CardList.
export interface CardRecord {
  id: string;
  title: string;
  slug: string;
  preview: string;
  issue: string;
  position: number;
  pin: boolean;
  created: string;
  updated: string;
}

// Add/edit page for a single card, reached from CardList's "add card"
// button (create, at /:slug/new) or by clicking a card (edit, at
// /:slug/:cardSlug). A brand-new card's PocketBase record is no longer created on mount:
// the editor starts on a local-only Y.Doc, and its backing record is
// only created once the user has actually typed a header/body (see
// NoteEditor's slugCandidatePlugin and onCardCreated prop). Leaving
// /:slug/new without typing anything therefore never leaves behind an
// empty card.
export default function CardForm() {
  const params = useParams();
  const navigate = useNavigate();

  // The parent issue/pot, used for the browser tab title (see
  // useTitle below) and, in draft mode, as NoteEditor's issueId.
  const [issue] = createResource(() => params.slug, fetchIssueBySlug);

  const [recordId, setRecordId] = createSignal("");
  const [notFound, setNotFound] = createSignal(false);

  onMount(async () => {
    if (!params.cardSlug) return; // draft mode -- nothing to resolve eagerly

    // Editing an existing card: its PocketBase id isn't in the URL --
    // it's resolved by matching the decoded slug within the issue
    // identified by :slug. Slugs are unique within an issue (enforced
    // at the database level), so this lookup returns at most one
    // record. Filtering on the related issue's "slug" directly (dot
    // notation) avoids a separate lookup just to get the issue's id.
    try {
      const record = await pb
        .collection("cards")
        .getFirstListItem<CardRecord>(
          pb.filter("issue.slug = {:slug} && slug = {:cardSlug}", {
            slug: params.slug,
            cardSlug: segmentToCardSlug(params.cardSlug),
          }),
        );
      mergeCards([record]);
      setRecordId(record.id);
    } catch {
      setNotFound(true);
    }
  });

  // Keeps the address bar's slug segment in sync as the card's slug
  // changes server-side (see internal/serve/cards.go's
  // updateCardSlugHandler). Only the URL is swapped, using
  // history.replaceState directly instead of navigate() so this never
  // adds a back-button entry or remounts the component -- important
  // now that a draft can silently become a real card mid-edit.
  let urlSegment = params.cardSlug ?? "";
  createEffect(() => {
    const id = recordId();
    if (!id) return;
    const slug = cardsById[id]?.slug ?? "";
    if (!slug) return;
    const segment = cardSlugToSegment(slug);
    if (segment === urlSegment) return;
    urlSegment = segment;
    history.replaceState(null, "", `/${params.slug}/${segment}`);
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
    navigate(`/${params.slug}`);
  };

  // Whether this card is currently pinned, read from the shared cards
  // store (see lib/cardsStore.ts) so it stays in sync with CardList's
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

  // Browser tab title: "<card title> - <pot name>". Falls back to just
  // the pot's name while a draft has no card title yet (see
  // useTitle.ts for the actual document.title wiring).
  useTitle(() => {
    const pot = issue()?.title;
    if (!pot) return undefined;
    const cardTitle = cardsById[recordId()]?.title;
    return cardTitle ? `${cardTitle} - ${pot}` : pot;
  });

  return (
    <Show
      when={!notFound()}
      fallback={
        <div class="flex flex-col items-center gap-2 py-12 text-text">
          <p>Card not found.</p>
          <A href={`/${params.slug}`} class="underline">
            Back to issue
          </A>
        </div>
      }
    >
      {/* Editing an existing card waits for its record to resolve
          (Loading fallback). A draft (/:slug/new) has nothing to wait
          for: the editor starts immediately on a local-only Y.Doc, and
          recordId only appears once the user has typed something (see
          createDraftRecord). */}
      <Show when={params.cardSlug ? recordId() : true} fallback={<Loading />}>
        {/* Layout for a card-editing screen: pin/delete icons above the
            editor. NoteEditor itself stays layout-agnostic so it can be
            reused without this app's card-specific chrome. */}
        <div class="flex flex-col">
        {/* min-h-9 keeps this row's height consistent whether or not
            the pin/delete buttons are rendered, so a draft card (no
            recordId yet) doesn't lose the gap below TopBar that an
            existing card gets from these buttons. */}
        <div class="flex min-h-9 justify-end gap-2">
          {/* Pin/delete only make sense once a record actually exists
              -- an unconfirmed draft has nothing to pin or delete. */}
          <Show when={recordId()}>
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
          </Show>
        </div>
          <NoteEditor
            cardId={() => recordId() || undefined}
            issueId={() => issue()?.id}
            onCardCreated={setRecordId}
          />
        </div>
      </Show>
    </Show>
  );
}

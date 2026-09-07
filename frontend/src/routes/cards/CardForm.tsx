import {
  onMount,
  createSignal,
  createResource,
  createEffect,
  Show,
} from "solid-js";
import { useParams, useNavigate, A } from "@solidjs/router";

import { Alert } from "@kobalte/core/alert";

import pb from "../../lib/pb";
import NoteEditor from "../../components/noteEditor";
import Loading from "../../components/Loading";
import { Trash2, Pin, PinOff } from "../../lib/icons";
import { cardsById, mergeCards } from "../../lib/cardsStore";
import { cardSlugToSegment, segmentToCardSlug } from "../../lib/cardSlug";
import { fetchPotBySlug } from "../../lib/pots";
import { useTitle } from "../../lib/useTitle";
import { computePosition } from "../../lib/position";

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
  description: string;
  pot: string;
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

  // The parent pot/pot, used for the browser tab title (see
  // useTitle below) and, in draft mode, as NoteEditor's potId.
  const [pot] = createResource(() => params.slug, fetchPotBySlug);

  const [recordId, setRecordId] = createSignal("");
  const [notFound, setNotFound] = createSignal(false);

  onMount(async () => {
    if (!params.cardSlug) return; // draft mode -- nothing to resolve eagerly

    // Editing an existing card: its PocketBase id isn't in the URL --
    // it's resolved by matching the decoded slug within the pot
    // identified by :slug. Slugs are unique within an pot (enforced
    // at the database level), so this lookup returns at most one
    // record. Filtering on the related pot's "slug" directly (dot
    // notation) avoids a separate lookup just to get the pot's id.
    try {
      const record = await pb.collection("cards").getFirstListItem<CardRecord>(
        pb.filter("pot.slug = {:slug} && slug = {:cardSlug}", {
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

  // Merge-alert target: the slug this card's header text duplicates,
  // determined server-side on each slug-resolving API call (see
  // findMergeTarget in internal/serve/slug.go and NoteEditor's
  // onMergeTarget below). Only ever updated right after such a call,
  // so opening an existing card without editing its header shows no
  // alert until the next edit. Merging itself isn't implemented yet --
  // this only surfaces the alert.
  const [mergeTarget, setMergeTarget] = createSignal<string | null>(null);

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

  // Position that sorts right after every other pinned card in this
  // pot, so a newly pinned card lands at the bottom of the pinned
  // group instead of keeping whatever position it had while unpinned.
  const nextPinnedPosition = (excludeId: string): number => {
    const potId = cardsById[excludeId]?.pot;
    const pinnedPositions = Object.values(cardsById)
      .filter(
        (card) => card.pot === potId && card.pin && card.id !== excludeId,
      )
      .map((card) => card.position);
    const lowestPinned =
      pinnedPositions.length > 0 ? Math.min(...pinnedPositions) : undefined;
    return computePosition(undefined, lowestPinned);
  };

  const togglePin = async () => {
    const id = recordId();
    if (!id) return;
    const nowPinning = !pinned();
    // Only pinning repositions the card (to the bottom of the pinned
    // group); unpinning leaves its position untouched.
    const position = nowPinning ? nextPinnedPosition(id) : undefined;
    try {
      const updated = await pb.collection("cards").update<CardRecord>(id, {
        pin: nowPinning,
        ...(position !== undefined ? { position } : {}),
      });
      mergeCards([updated]);
    } catch {
      // Best-effort: if this fails the pin state simply doesn't change.
    }
  };

  // Browser tab title: "<card title> - <pot name>". Falls back to just
  // the pot's name while a draft has no card title yet (see
  // useTitle.ts for the actual document.title wiring).
  useTitle(() => {
    const pot = pot()?.title;
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
            Back to pot
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
          <Show when={mergeTarget()}>
            <Alert class="mb-2 rounded-md border border-[#dc3545] bg-card px-3 py-2 text-sm text-[#dc3545]">
              "{mergeTarget()}" already exists.
            </Alert>
          </Show>
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
            potId={() => pot()?.id}
            onCardCreated={setRecordId}
            onMergeTarget={setMergeTarget}
          />
        </div>
      </Show>
    </Show>
  );
}

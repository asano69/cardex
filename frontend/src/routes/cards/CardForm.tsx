import { createSignal, createResource, createEffect, Show } from "solid-js";
import { useParams, useNavigate, A } from "@solidjs/router";

import { Alert } from "@kobalte/core/alert";

import pb from "../../lib/pb";
import NoteEditor from "../../components/noteEditor";
import Loading from "../../components/Loading";
import { Trash2, Pin, PinOff } from "../../lib/icons";
import { cardsById, mergeCards } from "../../lib/cardsStore";
import {
  titleToSegment,
  titleToSlug,
  segmentToSlug,
  slugToTitle,
} from "../../lib/slugify";
import { useTitle } from "../../lib/useTitle";
import { useTopBarActions } from "../../lib/topBarSlot";
import { computePosition } from "../../lib/position";
import { deriveCardGridTitle } from "../../lib/cardGridTitle";
import { usePot } from "../pots/PotContext";
import type { CardTitle } from "../../lib/cardTitle";

// Matches the PocketBase "cards" collection schema. "title" is a
// display label derived server-side from the card's live Yjs body
// (see internal/serve/ydoc.go and internal/serve/slug.go), resolved
// via a dedicated route (see internal/serve/cards.go and
// lib/cardApi.ts). There is no separate "slug" field anymore -- a
// card's URL segment is derived from this same title on demand (see
// lib/slugify.ts). "position" is a fractional-indexing sort key (see
// lib/position.ts) used to persist the tile grid's drag-to-reorder
// order in CardList.
export interface CardRecord {
  id: string;
  title: CardTitle;
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

  // The parent pot, used for the browser tab title (see useTitle
  // below) and, in draft mode, as NoteEditor's potId. Fetched once by
  // the parent PotLayout route and shared via PotContext, instead of
  // fetching it again here.
  const pot = usePot();

  const [recordId, setRecordId] = createSignal("");
  const [notFound, setNotFound] = createSignal(false);
  // Set once the lookup below has run and found no matching card: the
  // page opens in draft mode instead of "not found", pre-filling the
  // header with this text (see slugToTitle and NoteEditor's
  // initialTitle prop). Stays undefined while loading, or once a
  // matching record is found.
  //
  // No explicit <string | undefined> generic here: a union type
  // argument on createSignal<...>(...) is ambiguous with a JSX tag in
  // a .tsx file, which breaks the parser into treating `createSignal`
  // as an un-called reference (destructuring the function itself
  // instead of its return value). Casting the initial value instead
  // sidesteps that ambiguity.
  const [draftInitialTitle, setDraftInitialTitle] = createSignal(
    undefined as string | undefined,
  );

  // Editing an existing card: its PocketBase id isn't in the URL, and
  // there's no stored "slug" field to filter on anymore (see
  // lib/slugify.ts) -- every card in the pot is fetched and matched by
  // re-deriving its own slug from its title, since titleToSlug is a
  // pure function and titles are already guaranteed unique per pot.
  // Waits for `pot` to resolve first, since the filter below needs its
  // PocketBase id rather than its slug.
  // TODO: this is an O(n) scan over every card in the pot -- fine for
  // now, but worth moving to a backend route (with its own index) if
  // pots regularly grow into the thousands of cards.
  createResource(
    () => (params.cardSlug ? pot()?.id : undefined),
    async (potId) => {
      const targetSlug = segmentToSlug(params.cardSlug!);
      let candidates: CardRecord[];
      try {
        candidates = await pb.collection("cards").getFullList<CardRecord>({
          filter: pb.filter("pot = {:pot}", { pot: potId }),
        });
      } catch {
        // A genuine fetch failure (network, auth, ...) -- distinct
        // from "no card matches this slug" below, which opens a draft
        // instead of this "not found" page.
        setNotFound(true);
        return;
      }
      const record = candidates.find(
        (card) => titleToSlug(card.title) === targetSlug,
      );
      if (record) {
        mergeCards([record]);
        setRecordId(record.id);
        return;
      }
      // No card matches this slug yet -- open a draft pre-filled with
      // the slug's title instead of "not found", so visiting e.g.
      // /:pot/test creates a new card titled "test" once its header is
      // confirmed (same flow as /:pot/new -- see NoteEditor).
      setDraftInitialTitle(slugToTitle(targetSlug));
    },
  );

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
    const title = cardsById[id]?.title ?? "";
    if (!title) return;
    const segment = titleToSegment(title);
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
      .filter((card) => card.pot === potId && card.pin && card.id !== excludeId)
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

  // Browser tab title: "<pot name> - <card grid title>". Falls back to
  // just the pot's name while a draft has no card title yet (see
  // useTitle.ts for the actual document.title wiring). The grid title
  // (see lib/cardGridTitle.ts) is used instead of the raw stored title
  // so whitespace renders the same way it does in CardList's grid.
  useTitle(() => {
    const potTitle = pot()?.title;
    if (!potTitle) return undefined;
    const card = cardsById[recordId()];
    return card ? `${deriveCardGridTitle(card)} - ${potTitle}` : potTitle;
  });

  // TopBar's pot-name link (and the "add card" button next to it) is
  // now registered once by the parent PotLayout route, not here -- see
  // lib/router.tsx and routes/pots/PotLayout.tsx.

  // Page-specific TopBar chrome (see lib/topBarSlot.ts): pin/delete
  // only make sense once a record actually exists -- an unconfirmed
  // draft has nothing to pin or delete -- so the Show guards the
  // whole thing, same as before this moved out of the page body.
  useTopBarActions(() => (
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
  ));

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
      <Show
        when={
          params.cardSlug
            ? recordId() !== "" || draftInitialTitle() !== undefined
            : true
        }
        fallback={<Loading />}
      >
        {/* Layout for a card-editing screen: pin/delete icons above the
            editor. NoteEditor itself stays layout-agnostic so it can be
            reused without this app's card-specific chrome. */}
        <div class="flex flex-col">
          <Show when={mergeTarget()}>
            <Alert class="mb-2 rounded-md border border-[#dc3545] bg-card px-3 py-2 text-sm text-[#dc3545]">
              "{mergeTarget()}" already exists.
            </Alert>
          </Show>
          <NoteEditor
            cardId={() => recordId() || undefined}
            potId={() => pot()?.id}
            initialTitle={draftInitialTitle()}
            onCardCreated={setRecordId}
            onMergeTarget={setMergeTarget}
          />
        </div>
      </Show>
    </Show>
  );
}

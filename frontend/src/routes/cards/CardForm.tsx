import {
  createSignal,
  createMemo,
  createResource,
  createEffect,
  Show,
} from "solid-js";
import { useParams, useNavigate, A } from "@solidjs/router";

import { Alert } from "@kobalte/core/alert";

import { ClientResponseError } from "pocketbase";

import pb from "../../lib/pb";
import NoteEditor from "../../components/noteEditor";
import Loading from "../../components/Loading";
import { Trash2, Pin, PinOff } from "../../lib/icons";
import { cardsById, mergeCards } from "../../lib/cardsStore";
import { fetchCardBySlug } from "../../lib/cardApi";
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
  // First image URL found in the card's live document, resolved
  // server-side alongside "description" (see internal/xmldoc's
  // FirstImageSrc and internal/serve/ydoc.go's updatePreview). Empty
  // string when the document has no image.
  image: string;
  pot: string;
  position: number;
  pin: boolean;
  created: string;
  updated: string;
}

// Discriminated union covering every state this page's card can be
// in. Replaces three independently-updated signals (a "recordId"
// string, a "notFound" boolean, and a "draftInitialTitle" string or
// undefined) that used to make combinations like "not found, but also
// has a draft title" representable even though they should never
// coexist. Collapsing them into one value means only one of these
// four shapes can ever be true at a time -- the type itself rules out
// the invalid combinations rather than relying on every call site to
// keep them in sync by convention.
//
//   - "loading": resolving an existing card's id from its URL slug
//     (see the createResource below). Never the initial state when
//     there is no cardSlug at all (a plain "/:slug/new" route has
//     nothing to resolve, so it starts straight in "draft").
//   - "existing": a real "cards" record was found (or was just
//     created by a draft's first confirmed title -- see
//     handleCardCreated).
//   - "draft": no backing record exists yet. `initialTitle` seeds the
//     editor's first line when opening a URL slug that matched no
//     existing card (see CardForm's own comment above about
//     /:pot/:cardSlug); omitted for the plain "/:slug/new" route.
//   - "notFound": the lookup itself failed (network/auth error, not
//     "no card has this title") -- distinct from "draft", which is
//     what a missing-but-plausible slug resolves to instead.
type CardEditorState =
  | { kind: "loading" }
  | { kind: "existing"; cardId: string }
  | { kind: "draft"; initialTitle?: string }
  | { kind: "notFound" };

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

  // Single source of truth for this page's card (see CardEditorState
  // above). A URL with a cardSlug has something to resolve, so it
  // starts in "loading"; a plain "/:slug/new" route has nothing to
  // resolve and starts straight in "draft".
  const [state, setState] = createSignal<CardEditorState>(
    params.cardSlug ? { kind: "loading" } : { kind: "draft" },
  );

  // Derived accessor for the id of an already-existing record, used
  // by every piece of chrome (pin/delete, tab title, URL sync) that
  // only makes sense once a real "cards" record exists. undefined
  // covers both "still loading" and "still a draft".
  const cardId = createMemo(() => {
    const s = state();
    return s.kind === "existing" ? s.cardId : undefined;
  });

  // Editing an existing card: its PocketBase id isn't in the URL, and
  // there's no stored "slug" field to filter on anymore (see
  // lib/slugify.ts) -- the backend resolves the slug against the
  // pot's cards instead of shipping every card's full record here
  // (see internal/serve/cards.go's findCardBySlugHandler). Waits for
  // `pot` to resolve first, since the lookup needs its PocketBase id
  // rather than its slug.
  createResource(
    () => (params.cardSlug ? pot()?.id : undefined),
    async (potId) => {
      const targetSlug = segmentToSlug(params.cardSlug!);
      try {
        const record = await fetchCardBySlug(potId, targetSlug);
        mergeCards([record]);
        setState({ kind: "existing", cardId: record.id });
      } catch (err) {
        // A 404 means no card matches this slug yet -- open a draft
        // pre-filled with the slug's title instead of "not found", so
        // visiting e.g. /:pot/test creates a new card titled "test"
        // once its header is confirmed (same flow as /:pot/new -- see
        // NoteEditor). Any other error (network, auth, ...) falls
        // through to the "not found" page instead.
        if (err instanceof ClientResponseError && err.status === 404) {
          setState({ kind: "draft", initialTitle: slugToTitle(targetSlug) });
          return;
        }
        setState({ kind: "notFound" });
      }
    },
  );

  // Called by NoteEditor the moment a draft's backing "cards" record
  // is created (see its onCardCreated prop) -- the point where this
  // page's card stops being a draft and becomes a real, existing one.
  const handleCardCreated = (id: string) => {
    setState({ kind: "existing", cardId: id });
  };

  // Keeps the address bar's slug segment in sync as the card's slug
  // changes server-side (see internal/serve/cards.go's
  // updateCardSlugHandler). Only the URL is swapped, using
  // history.replaceState directly instead of navigate() so this never
  // adds a back-button entry or remounts the component -- important
  // now that a draft can silently become a real card mid-edit.
  let urlSegment = params.cardSlug ?? "";
  createEffect(() => {
    const id = cardId();
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
    const id = cardId();
    if (!id) return;
    await pb.collection("cards").delete(id);
    navigate(`/${params.slug}`);
  };

  // Whether this card is currently pinned, read from the shared cards
  // store (see lib/cardsStore.ts) so it stays in sync with CardList's
  // grid ordering and with other users' edits, instead of tracking a
  // separate local copy.
  const pinned = () => cardsById[cardId() ?? ""]?.pin ?? false;

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
    const id = cardId();
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
    const id = cardId();
    const card = id ? cardsById[id] : undefined;
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
    <Show when={cardId()}>
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
      when={state().kind !== "notFound"}
      fallback={
        <div class="flex flex-col items-center gap-2 py-12 text-text">
          <p>Card not found.</p>
          <A href={`/${params.slug}`} class="underline">
            Back to pot
          </A>
        </div>
      }
    >
      {/* "loading" is the only state that still needs to wait: both
          "existing" and "draft" already have everything NoteEditor
          needs (a real cardId, or an initialTitle/nothing to seed a
          fresh Y.Doc with). */}
      <Show when={state().kind !== "loading"} fallback={<Loading />}>
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
            cardId={cardId}
            potId={() => pot()?.id}
            initialTitle={
              state().kind === "draft"
                ? (state() as { kind: "draft"; initialTitle?: string })
                    .initialTitle
                : undefined
            }
            onCardCreated={handleCardCreated}
            onMergeTarget={setMergeTarget}
          />
        </div>
      </Show>
    </Show>
  );
}

import { onMount, createSignal, createEffect, Show } from "solid-js";
import { useParams, useNavigate, A } from "@solidjs/router";

import pb from "../../lib/pb";
import NoteEditor from "../../components/noteEditor";
import Loading from "../../components/Loading";
import { Trash2, Pin, PinOff } from "../../lib/icons";
import { POSITION_STEP } from "../../lib/position";
import { randomKey } from "../../lib/randomKey";
import { cardsById, mergeCards } from "../../lib/cardsStore";
import { cardTitleToSegment, segmentToCardTitle } from "../../lib/cardSlug";
import type { IssueRecord } from "./IssueForm";

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

// How many times createDraftRecord retries a failed create() call
// before giving up. There is no sync-status UI yet, so a card the
// user is actively typing into can silently stay local-only past this
// point -- see the console.error left behind by NoteEditor.
const CREATE_MAX_ATTEMPTS = 3;
const CREATE_RETRY_DELAY_MS = 1000;

// Add/edit page for a single card, reached from IssueDetail's "add card"
// button (create, at /:slug/new) or by clicking a card (edit, at
// /:slug/:cardTitle). A brand-new card's PocketBase record is no
// longer created on mount: the editor starts on a local-only Y.Doc
// (see NoteEditor's draft mode), and createDraftRecord below only
// creates the record once the user has actually typed something (see
// onDraftConfirmed). Leaving /:slug/new without typing anything
// therefore never leaves behind an empty card.
export default function CardForm() {
  const params = useParams();
  const navigate = useNavigate();

  const [recordId, setRecordId] = createSignal("");
  const [notFound, setNotFound] = createSignal(false);
  // Parent issue's PocketBase id, resolved on mount for draft mode
  // (see onMount below) -- only used by createDraftRecord.
  const [issueId, setIssueId] = createSignal("");
  // Set if createDraftRecord exhausts its retries. Surfaced as a
  // small inline message for now; a real sync-status indicator is
  // future work.
  const [draftError, setDraftError] = createSignal(false);
  // The placeholder title createDraftRecord assigns at creation time
  // (see randomKey.ts), so the URL-sync effect below can tell "not
  // synced yet" apart from a real (if coincidentally identical)
  // title. Plain variable, not a signal: only read from inside that
  // effect and never needs to trigger a re-render itself.
  let draftPlaceholderTitle: string | null = null;

  onMount(async () => {
    if (params.cardTitle) {
      // Editing an existing card: its PocketBase id isn't in the URL
      // anymore, so it's resolved by matching the decoded title within
      // the issue identified by :slug. Titles are unique within an
      // issue (enforced at the database level), so this lookup returns
      // at most one record. Filtering on the related issue's "slug"
      // directly (dot notation) avoids a separate lookup just to get
      // the issue's id.
      try {
        const record = await pb
          .collection("cards")
          .getFirstListItem<CardRecord>(
            pb.filter("issue.slug = {:slug} && title = {:title}", {
              slug: params.slug,
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

    // Draft mode (/:slug/new): only resolve the parent issue's id here,
    // since a relation field can't be set to a slug. The "cards"
    // record itself is created lazily by createDraftRecord below.
    const issue = await pb
      .collection("issues")
      .getFirstListItem<IssueRecord>(
        pb.filter("slug = {:slug}", { slug: params.slug }),
      );
    setIssueId(issue.id);
  });

  // Creates the backing "cards" record for a draft, called by
  // NoteEditor once the document's first non-empty content is
  // confirmed (see NoteEditor's onDraftConfirmed prop). Retries a
  // few times on failure (e.g. a dropped connection) before giving up.
  //
  // The temporary title (see randomKey.ts) only exists to satisfy the
  // (issue, title) uniqueness constraint until the server derives the
  // card's real title from its Yjs content shortly after (see
  // internal/serve/ydoc.go's updateTitleAndPreview) -- the URL-sync
  // effect below ignores it via draftPlaceholderTitle so the address
  // bar never flashes a random string.
  const createDraftRecord = async (): Promise<string> => {
    const issue = issueId();
    let lastErr: unknown;
    for (let attempt = 0; attempt < CREATE_MAX_ATTEMPTS; attempt++) {
      try {
        // New cards get the current highest position + POSITION_STEP
        // (see lib/position.ts), which puts them first in
        // IssueDetail's descending-sorted card grid. Only the current
        // highest position is fetched here -- never the full card
        // list -- so this stays cheap regardless of how many
        // thousands of cards the issue holds.
        const existing = await pb
          .collection("cards")
          .getList<CardRecord>(1, 1, {
            filter: pb.filter("issue = {:issue}", { issue }),
            sort: "-position",
          });
        const position = (existing.items[0]?.position ?? 0) + POSITION_STEP;
        const placeholderTitle = randomKey();
        const record = await pb.collection("cards").create<CardRecord>({
          title: placeholderTitle,
          issue,
          position,
        });
        draftPlaceholderTitle = placeholderTitle;
        mergeCards([record]);
        setRecordId(record.id);
        return record.id;
      } catch (err) {
        lastErr = err;
        if (attempt < CREATE_MAX_ATTEMPTS - 1) {
          await new Promise((resolve) =>
            setTimeout(resolve, CREATE_RETRY_DELAY_MS),
          );
        }
      }
    }
    setDraftError(true);
    throw lastErr;
  };

  // Keeps the address bar's title segment in sync as the card's title
  // changes server-side (see internal/serve/ydoc.go, which derives it
  // from the editor's live content). Only the URL is swapped, using
  // history.replaceState directly instead of navigate() so this never
  // adds a back-button entry or remounts the component -- important
  // now that a draft can silently become a real card mid-edit (e.g.
  // typing "a" when a card named "a" already exists lands on "a_2"
  // without the editor ever re-mounting). Skipped entirely while the
  // stored title still matches the draft's temporary placeholder (see
  // createDraftRecord), so the URL never flashes a random string
  // before the real title arrives.
  let urlSegment = params.cardTitle ?? "";
  createEffect(() => {
    const id = recordId();
    if (!id) return;
    const title = cardsById[id]?.title ?? "";
    if (title === draftPlaceholderTitle) return;
    const segment = cardTitleToSegment(title);
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
      <Show when={params.cardTitle ? recordId() : true} fallback={<Loading />}>
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
          {draftError() && (
            <p class="text-sm text-[#dc3545]">
              Failed to save this card. Your text is still here, but it
              isn't synced -- try reloading once you're back online.
            </p>
          )}
          <NoteEditor
            cardId={() => recordId() || undefined}
            onDraftConfirmed={recordId() ? undefined : createDraftRecord}
          />
        </div>
      </Show>
    </Show>
  );
}

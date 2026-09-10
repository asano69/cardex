import { createSignal } from "solid-js";
import { createStore, produce } from "solid-js/store";
import pb from "./pb";
import type { CardRecord } from "../routes/cards/CardForm";
import { withCardsFlip, registerCardElement } from "./cardFlip";

// Re-exported so CardItem only needs to import from this module
// (cardFlip.ts's registration map is an implementation detail of how
// cards get animated, not something callers need to know about).
export { registerCardElement };

// Global cache of every "cards" record seen so far, keyed by id. Pages
// that fetch cards (e.g. CardList) call mergeCards() to seed their
// results in here; startCardsSubscription() -- called once from
// AppShell -- then keeps the cache live via PocketBase's realtime API.
// Any page deriving its view from cardsById therefore reflects other
// users' edits, creates, and deletes without polling or its own
// subscription.
const [cardsById, setCardsById] = createStore<Record<string, CardRecord>>({});

export { cardsById };

// Whether the initial full-collection fetch (see loadAllCards below)
// has completed. CardList gates its "Loading" spinner on this instead
// of tracking its own per-mount fetch, since the whole "cards"
// collection is loaded once for the app's lifetime now, not once per
// CardList mount.
const [cardsLoaded, setCardsLoaded] = createSignal(false);

export { cardsLoaded };

// Merges a freshly fetched batch of cards into the store. Existing
// entries for the same id are overwritten, so a stale cached copy
// never wins over a fresh fetch. By default this is wrapped in
// withCardsFlip so a reorder (e.g. another user's drag) animates every
// affected card into its new grid slot instead of snapping there
// instantly.
//
// `skipFlip` opts out of that animation. dnd-kit already animates the
// dragged card into place during the gesture itself, so replaying our
// own FLIP animation on top of that (when the local dragger's own
// optimistic update lands) makes the card jump/stutter instead of
// looking smooth -- see CardList's handleDragEnd, the only caller
// that passes this.
export function mergeCards(
  records: CardRecord[],
  options?: { skipFlip?: boolean },
) {
  const apply = () => {
    setCardsById(
      produce((store) => {
        for (const record of records) {
          store[record.id] = record;
        }
      }),
    );
  };

  if (options?.skipFlip) {
    apply();
  } else {
    withCardsFlip(apply);
  }
}

// Fetches every "cards" record once and merges it into the shared
// store. Called once from AppShell (see AppShell.tsx) instead of once
// per CardList mount: the "cards" collection carries no document body
// (that lives in the Yjs room -- see internal/serve/ydoc.go), so even
// a few thousand records is a small payload, small enough that
// loading it all upfront beats paginating it per pot per visit.
//
// Runs independently of startCardsSubscription below -- any realtime
// event that arrives while this fetch is still in flight is simply
// overwritten by this fetch's own mergeCards call once it resolves,
// since both write through the same last-write-wins store.
export async function loadAllCards(): Promise<void> {
  try {
    const records = await pb
      .collection("cards")
      .getFullList<CardRecord>({ sort: "-created" });
    mergeCards(records, { skipFlip: true });
  } catch (err) {
    console.error("[cards] failed to load all cards:", err);
  } finally {
    setCardsLoaded(true);
  }
}

// Starts the shared "cards" realtime subscription and returns an
// unsubscribe function. Meant to be called once, from an onCleanup at
// the app's root (see AppShell.tsx) -- not from individual pages,
// since every page reads from the same store regardless of who started
// the subscription.
export function startCardsSubscription(): () => void {
  let unsubscribe: (() => void) | undefined;
  let cancelled = false;

  pb.collection("cards")
    .subscribe<CardRecord>("*", (e) => {
      // Wrapped in withCardsFlip so a position change from another
      // user's drag animates smoothly into place instead of every
      // card instantly snapping to its new grid slot.
      withCardsFlip(() => {
        if (e.action === "delete") {
          setCardsById(
            produce((store) => {
              delete store[e.record.id];
            }),
          );
        } else {
          // Covers both "create" and "update": either way the latest
          // record replaces whatever this id currently holds.
          setCardsById(e.record.id, e.record);
        }
      });
    })
    .then((unsub) => {
      // subscribe() is async, so the caller could have already
      // unsubscribed (e.g. fast HMR reload) by the time it resolves --
      // in that case, tear the subscription straight back down instead
      // of leaking it.
      if (cancelled) {
        unsub();
      } else {
        unsubscribe = unsub;
      }
    });

  return () => {
    cancelled = true;
    unsubscribe?.();
  };
}

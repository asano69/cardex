import { createStore, produce } from "solid-js/store";
import pb from "./pb";
import type { CardRecord } from "../routes/issues/CardForm";

// Global cache of every "cards" record seen so far, keyed by id. Pages
// that fetch cards (e.g. IssueDetail) call mergeCards() to seed their
// results in here; startCardsSubscription() -- called once from
// AppShell -- then keeps the cache live via PocketBase's realtime API.
// Any page deriving its view from cardsById therefore reflects other
// users' edits, creates, and deletes without polling or its own
// subscription.
const [cardsById, setCardsById] = createStore<Record<string, CardRecord>>({});

export { cardsById };

// Merges a freshly fetched batch of cards into the store. Existing
// entries for the same id are overwritten, so a stale cached copy
// never wins over a fresh fetch.
export function mergeCards(records: CardRecord[]) {
  setCardsById(
    produce((store) => {
      for (const record of records) {
        store[record.id] = record;
      }
    }),
  );
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

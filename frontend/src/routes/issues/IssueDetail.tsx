import { createResource, createMemo, For, Show } from "solid-js";
import { useParams, A } from "@solidjs/router";
import { ChevronsLeft as ChevronLeft, Plus } from "../../lib/icons";

import pb from "../../lib/pb";
import Loading from "../../components/Loading";
import CardItem from "./CardItem";
import { cardsById, mergeCards } from "../../lib/cardsStore";
import type { IssueRecord } from "./IssueForm";
import type { CardRecord } from "./CardForm";

async function fetchIssue(id: string): Promise<IssueRecord> {
  return await pb.collection("issues").getOne<IssueRecord>(id);
}

// Fetches every card belonging to this issue and seeds them into the
// shared cards store (see lib/cardsStore.ts). The `cards` memo below
// then renders from that store instead of from this one-shot result,
// so it stays live as other users' edits/creates/deletes arrive over
// the realtime subscription started in AppShell.
async function fetchCards(issueId: string): Promise<void> {
  const records = await pb.collection("cards").getFullList<CardRecord>({
    filter: pb.filter("issue = {:issue}", { issue: issueId }),
    sort: "-created",
  });
  mergeCards(records);
}

// Detail page for a single issue, reached via the folder-open button on
// IssueItem: the issue's title, an add-card button, and every card
// belonging to it laid out as a Scrapbox/Cosense-style card grid (see
// CardItem).
export default function IssueDetail() {
  const params = useParams();
  const [issue] = createResource(() => params.id, fetchIssue);
  const [cardsLoaded] = createResource(() => params.id, fetchCards);

  // Newest first, matching the original getFullList sort. Derived from
  // the shared store rather than cardsLoaded directly, so this list
  // reacts to realtime create/update/delete events too, not just the
  // initial fetch above.
  const cards = createMemo(() =>
    Object.values(cardsById)
      .filter((card) => card.issue === params.id)
      .sort((a, b) => b.created.localeCompare(a.created)),
  );

  return (
    <div class="flex w-full flex-col gap-4">
      <div class="flex items-center justify-between">
        <A href="/issues" class="icon-btn" aria-label="Back to issues">
          <ChevronLeft size={20} />
        </A>
        <A
          href={`/issues/${params.id}/cards/new`}
          class="icon-btn"
          aria-label="Add card"
        >
          <Plus size={20} />
        </A>
      </div>
 
        <h1 class="font-sans text-xl">{issue()?.title}</h1>
     
      <Show when={!cardsLoaded.loading} fallback={<Loading />}>
        <ul class="card-grid">
          <For each={cards()}>{(card) => <CardItem card={card} />}</For>
        </ul>
      </Show>
    </div>
  );
}

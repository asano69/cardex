import { createResource, For, Show } from "solid-js";
import { useParams, A } from "@solidjs/router";
import { ChevronsLeft as ChevronLeft, Plus } from "../../lib/icons";

import pb from "../../lib/pb";
import Loading from "../../components/Loading";
import CardItem from "./CardItem";
import type { IssueRecord } from "./IssueForm";
import type { CardRecord } from "./CardForm";

async function fetchIssue(id: string): Promise<IssueRecord> {
  return await pb.collection("issues").getOne<IssueRecord>(id);
}

// Every card belonging to this issue, newest first -- matches the
// "cards" collection's `issue` relation field (see CardForm.tsx).
async function fetchCards(issueId: string): Promise<CardRecord[]> {
  return await pb.collection("cards").getFullList<CardRecord>({
    filter: pb.filter("issue = {:issue}", { issue: issueId }),
    sort: "-created",
  });
}

// Detail page for a single issue, reached via the folder-open button on
// IssueItem: the issue's title, an add-card button, and every card
// belonging to it laid out as a Scrapbox/Cosense-style card grid (see
// CardItem).
export default function IssueDetail() {
  const params = useParams();
  const [issue] = createResource(() => params.id, fetchIssue);
  const [cards] = createResource(() => params.id, fetchCards);

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
      <Show when={!issue.loading} fallback={<Loading />}>
        <h1 class="font-sans text-4xl">{issue()?.title}</h1>
      </Show>
      <Show when={!cards.loading} fallback={<Loading />}>
        <ul class="card-grid">
          <For each={cards()}>{(card) => <CardItem card={card} />}</For>
        </ul>
      </Show>
    </div>
  );
}

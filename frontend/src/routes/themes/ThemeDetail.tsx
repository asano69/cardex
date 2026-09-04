import { createResource, For, Show } from "solid-js";
import { useParams, A } from "@solidjs/router";
import { ChevronsLeft as ChevronLeft, Plus } from "../../lib/icons";

import pb from "../../lib/pb";
import Loading from "../../components/Loading";
import type { ThemeRecord } from "./ThemeForm";
import type { CardRecord } from "./CardForm";

async function fetchTheme(id: string): Promise<ThemeRecord> {
  return await pb.collection("themes").getOne<ThemeRecord>(id);
}

// Every card belonging to this theme, newest first.
async function fetchCards(themeId: string): Promise<CardRecord[]> {
  return await pb.collection("cards").getFullList<CardRecord>({
    filter: pb.filter("theme = {:theme}", { theme: themeId }),
    sort: "-created",
  });
}

// Detail page for a single theme, reached via the folder-open button on
// ThemeItem: the theme's title, an add-card button, and every card
// belonging to this theme laid out as a grid of square tiles.
export default function ThemeDetail() {
  const params = useParams();
  const [theme] = createResource(() => params.id, fetchTheme);
  const [cards] = createResource(() => params.id, fetchCards);

  return (
    <div class="flex w-full flex-col gap-4">
      <div class="flex items-center justify-between">
        <A href="/themes" class="icon-btn" aria-label="Back to themes">
          <ChevronLeft size={20} />
        </A>
        <A
          href={`/themes/${params.id}/cards/new`}
          class="icon-btn"
          aria-label="Add card"
        >
          <Plus size={20} />
        </A>
      </div>
      <Show when={!theme.loading} fallback={<Loading />}>
        <h1 class="font-sans text-4xl">{theme()?.title}</h1>
      </Show>
      <Show when={!cards.loading} fallback={<Loading />}>
        {/* aspect-square keeps every tile the same width and height
            regardless of how much text it holds; overflow-hidden plus
            line-clamp trims longer cards instead of growing the tile.
            More, smaller columns than before to fit more tiles at once. */}
        <div class="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
          <For each={cards()}>
            {(card) => (
              <div class="aspect-square overflow-hidden rounded-md border border-border bg-card p-2 shadow-card">
                <p class="line-clamp-3 whitespace-pre-wrap text-xs">
                  {card.content}
                </p>
              </div>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}

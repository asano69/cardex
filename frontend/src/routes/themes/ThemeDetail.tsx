import { createResource, Show } from "solid-js";
import { useParams, A } from "@solidjs/router";
import { ChevronsLeft as ChevronLeft } from "../../lib/icons";

import pb from "../../lib/pb";
import Loading from "../../components/Loading";
import type { ThemeRecord } from "./ThemeForm";

async function fetchTheme(id: string): Promise<ThemeRecord> {
  return await pb.collection("themes").getOne<ThemeRecord>(id);
}

// Detail page for a single theme, reached via the folder-open button on
// ThemeItem. Will eventually list the cards belonging to this theme;
// for now it only shows the theme's title as a placeholder.
export default function ThemeDetail() {
  const params = useParams();
  const [theme] = createResource(() => params.id, fetchTheme);

  return (
    <div class="flex w-full flex-col gap-4">
      <A href="/themes" class="icon-btn self-start" aria-label="Back to themes">
        <ChevronLeft size={20} />
      </A>
      <Show when={!theme.loading} fallback={<Loading />}>
        <h1 class="font-sans text-4xl">{theme()?.title}</h1>
      </Show>
      {/* TODO: list this theme's cards here. */}
    </div>
  );
}

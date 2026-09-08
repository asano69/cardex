import { createSignal, createEffect, onCleanup, type JSX } from "solid-js";

// Holds whatever the currently active page wants shown in TopBar's
// per-page actions slot (see components/layout/TopBar.tsx). This is
// the "slot" layer between the layout's fixed structure (TopBar) and
// a page's own content (e.g. CardForm's pin/delete buttons): TopBar
// only knows a slot exists, never what any given page puts into it.
const [topBarActions, setTopBarActions] = createSignal<JSX.Element>();
export { topBarActions };

// Registers `actions` as the page's contribution to TopBar's
// per-page slot for as long as the calling component stays mounted,
// clearing it again on cleanup. Same restore-on-unmount shape as
// useTitle.ts, except there's nothing to restore back to -- only one
// page's actions are ever relevant at a time, so cleanup just clears
// the slot instead of reinstating a previous value.
export function useTopBarActions(actions: () => JSX.Element | undefined): void {
  createEffect(() => {
    setTopBarActions(actions());
  });
  onCleanup(() => setTopBarActions(undefined));
}

// A page can also show a link to its parent pot next to TopBar's Pot
// icon (e.g. CardList/CardForm showing the current pot's name). Kept
// as its own signal, not folded into topBarActions, since it has a
// different shape (a name + slug, not raw JSX) and a different
// position in TopBar's markup.
export interface TopBarPotLink {
  name: string;
  slug: string;
}

const [topBarPotLink, setTopBarPotLink] = createSignal<TopBarPotLink>();
export { topBarPotLink };

// Registers `link` as the current pot link for as long as the calling
// component stays mounted, clearing it again on cleanup -- same
// pattern as useTopBarActions above.
export function useTopBarPotLink(link: () => TopBarPotLink | undefined): void {
  createEffect(() => {
    setTopBarPotLink(link());
  });
  onCleanup(() => setTopBarPotLink(undefined));
}

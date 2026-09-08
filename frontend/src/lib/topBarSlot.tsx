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

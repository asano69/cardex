// frontend/src/lib/mediaQuery.ts
import { createSignal, onCleanup, type Accessor } from "solid-js";

// Tracks whether the viewport matches `query`, updating live as the
// window is resized. Wrapped in a signal (not a plain boolean) so any
// component reading it via the returned accessor re-renders automatically.
export function createMediaQuery(query: string): Accessor<boolean> {
  const mql = window.matchMedia(query);
  const [matches, setMatches] = createSignal(mql.matches);
  const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
  mql.addEventListener("change", handler);
  onCleanup(() => mql.removeEventListener("change", handler));
  return matches;
}

// Breakpoint mirrors Tailwind's default `md` (768px): below it counts
// as mobile, matching Sidebar's overlay behavior.
export function createIsMobile(): Accessor<boolean> {
  return createMediaQuery("(max-width: 767px)");
}

import { onCleanup, type ParentProps } from "solid-js";
import MainLayout from "./MainLayout";
import { startCardsSubscription } from "../../lib/cardsStore";

// Wraps every route so Header and Sidebar render once regardless of page.
// Passed as Router's `root` prop (see lib/router.tsx) instead of wrapping
// <Router> from outside, since anything AppShell renders needs to live
// inside the router context (e.g. Logo's <A> links).
//
// Also starts the shared "cards" realtime subscription here, since
// AppShell is mounted exactly once for the app's lifetime (only after
// AuthGate lets the user in): the natural single place to own it,
// instead of every page that reads cards managing its own subscription
// (see lib/cardsStore.ts).
export default function AppShell(props: ParentProps) {
  onCleanup(startCardsSubscription());

  return <MainLayout>{props.children}</MainLayout>;
}

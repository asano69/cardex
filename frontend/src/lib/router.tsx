// frontend/src/lib/router.tsx
import { Router, Route } from "@solidjs/router";

import AppShell from "../components/layout/AppShell";
import PotLayout from "../routes/pots/PotLayout";

import PotList from "../routes/pots/PotList";
import CardList from "../routes/cards/CardList";
import CardForm from "../routes/cards/CardForm";
import PocPots from "../routes/poc/Pots";

// All top-level routes in one place, so adding or removing a page never
// requires touching main.tsx.
//
// AppShell is passed as `root` rather than wrapped around <Router> here,
// so its contents (e.g. NavBar's <A> links) render inside the router
// context instead of erroring outside a Route.
export default function AppRouter() {
  return (
    <Router root={AppShell}>
      <Route path="/" component={PotList} />
      {/* Standalone proof-of-concept page, unrelated to pots/cards.
          Registered as its own static top-level route so it doesn't
          get swallowed by the "/:slug/:cardSlug" pattern below. */}
      <Route path="/poc/pots" component={PocPots} />
      {/* The pot segment in the URL is now the pot's unique
          "slug" field, not its PocketBase id (see CardList.tsx
          and CardForm.tsx, which resolve the actual record via
          this slug). PotLayout owns fetching the pot and registering
          TopBar's pot-name link (see PotLayout.tsx), so it stays
          mounted continuously while navigating between CardList and
          CardForm below instead of flickering on every transition. */}
      <Route path="/:slug" component={PotLayout}>
        <Route path="/" component={CardList} />
        {/* "/new" (draft creation) and "/:cardSlug" (edit) share ONE
            Route -- not two separate <Route> elements -- so navigating
            between them never remounts CardForm/NoteEditor.
            CardForm's own URL-sync effect replaces "/new" with
            "/:cardSlug" the instant a draft's title resolves (right
            after createCard() returns); with two separate routes,
            Solid Router treated that as a match against a different
            Route and tore down the still-connecting WebsocketProvider
            and its in-memory Y.Doc before the just-typed header ever
            reached the server. The freshly mounted NoteEditor then
            synced against the (still empty) server room, so line0
            came back blank -- intermittently, only when the WebSocket
            handshake lost the race against that reactive navigate.
            "new" is a reserved slug (see internal/serve/slug.go's
            reservedSlug handling), so a real card can never resolve to
            it and collide with this literal path; it's listed first
            so the static segment still wins the match. */}
        <Route path={["/new", "/:cardSlug"]} component={CardForm} />
      </Route>
    </Router>
  );
}

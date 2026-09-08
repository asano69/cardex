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
        {/* "new" is a reserved slug: this route always opens the
            draft-creation flow (see CardForm.tsx), so a real card can
            never resolve to the slug "new" and be reachable here --
            the backend renames any card that would derive that slug
            (see internal/serve/slug.go's reservedSlug handling).
            Declared before the :cardSlug route below so the static
            segment wins the match. */}
        <Route path="/new" component={CardForm} />
        {/* Edit route shares CardForm with the create route above; the
            presence of :cardSlug is what switches it into edit mode.
            The card's actual PocketBase id is resolved by matching
            this (decoded) slug within the pot identified by :slug --
            see CardForm.tsx and lib/cardSlug.ts. */}
        <Route path="/:cardSlug" component={CardForm} />
      </Route>
    </Router>
  );
}

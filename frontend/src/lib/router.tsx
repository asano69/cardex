// frontend/src/lib/router.tsx
import { Router, Route } from "@solidjs/router";

import AppShell from "../components/layout/AppShell";

import Issues from "../routes/issues";
import IssueDetail from "../routes/issues/IssueDetail";
import CardForm from "../routes/issues/CardForm";

// All top-level routes in one place, so adding or removing a page never
// requires touching main.tsx.
//
// AppShell is passed as `root` rather than wrapped around <Router> here,
// so its contents (e.g. NavBar's <A> links) render inside the router
// context instead of erroring outside a Route.
export default function AppRouter() {
  return (
    <Router root={AppShell}>
      <Route path="/" component={Issues} />
      <Route path="/:id" component={IssueDetail} />
      <Route path="/:id/cards/new" component={CardForm} />
      {/* Edit route shares CardForm with the create route above; the
          presence of :cardTitle is what switches it into edit mode.
          The card's actual PocketBase id is resolved by matching this
          (decoded) title within the issue -- see CardForm.tsx and
          lib/cardSlug.ts. */}
      <Route path="/:id/:cardTitle" component={CardForm} />
    </Router>
  );
}

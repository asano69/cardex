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
      <Route path="/:slug" component={IssueDetail} />
      {/* The issue segment in the URL is now the issue's unique
          "slug" field, not its PocketBase id (see IssueDetail.tsx
          and CardForm.tsx, which resolve the actual record via
          this slug). */}
      {/* "new" is a reserved title: this route always opens the
          draft-creation flow (see CardForm.tsx), so a real card can
          never be titled literally "new" and reachable here -- the
          backend renames any card that would derive that title (see
          internal/serve/ydoc.go's resolveReservedTitle). Declared
          before the :cardTitle route below so the static segment
          wins the match. */}
      <Route path="/:slug/new" component={CardForm} />
      {/* Edit route shares CardForm with the create route above; the
          presence of :cardTitle is what switches it into edit mode.
          The card's actual PocketBase id is resolved by matching this
          (decoded) title within the issue identified by :slug -- see
          CardForm.tsx and lib/cardSlug.ts. */}
      <Route path="/:slug/:cardTitle" component={CardForm} />
    </Router>
  );
}

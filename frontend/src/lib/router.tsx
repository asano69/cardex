// frontend/src/lib/router.tsx
import { Router, Route, Navigate } from "@solidjs/router";

import AppShell from "../components/layout/AppShell";

import Issues from "../routes/issues";
import IssueDetail from "../routes/issues/IssueDetail";
import CardForm from "../routes/issues/CardForm";
import YjsPoc from "../routes/YjsPoc";

// All top-level routes in one place, so adding or removing a page never
// requires touching main.tsx.
//
// AppShell is passed as `root` rather than wrapped around <Router> here,
// so its contents (e.g. NavBar's <A> links) render inside the router
// context instead of erroring outside a Route.
export default function AppRouter() {
  return (
    <Router root={AppShell}>
      <Route path="/" component={() => <Navigate href="/issues" />} />

      <Route path="/issues" component={Issues} />
      <Route path="/issues/:id" component={IssueDetail} />
      <Route path="/issues/:id/cards/new" component={CardForm} />
      {/* Edit route shares CardForm with the create route above; the
          presence of :cardId is what switches it into edit mode. */}
      <Route path="/issues/:id/cards/:cardId" component={CardForm} />

      {/* Temporary PoC route for docs/yjs-design.md -- remove once the
          real-time sync design is validated and merged into CardForm. */}
      <Route path="/yjs-poc" component={YjsPoc} />
    </Router>
  );
}

// frontend/src/lib/router.tsx
import { Router, Route, Navigate } from "@solidjs/router";

import AppShell from "../components/layout/AppShell";

import Themes from "../routes/themes";
import ThemeDetail from "../routes/themes/ThemeDetail";
import CardForm from "../routes/themes/CardForm";

// All top-level routes in one place, so adding or removing a page never
// requires touching main.tsx.
//
// AppShell is passed as `root` rather than wrapped around <Router> here,
// so its contents (e.g. NavBar's <A> links) render inside the router
// context instead of erroring outside a Route.
export default function AppRouter() {
  return (
    <Router root={AppShell}>
      {/* Themes is the app's primary page, so "/" redirects straight to
          it instead of rendering a separate placeholder home page. */}
      <Route path="/" component={() => <Navigate href="/themes" />} />

      <Route path="/themes" component={Themes} />
      <Route path="/themes/:id" component={ThemeDetail} />
      <Route path="/themes/:id/cards/new" component={CardForm} />
      {/* Edit route shares CardForm with the create route above; the
          presence of :cardId is what switches it into edit mode. */}
      <Route path="/themes/:id/cards/:cardId" component={CardForm} />
    </Router>
  );
}

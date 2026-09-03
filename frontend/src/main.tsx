// frontend/src/main.tsx
import { render } from "solid-js/web";

// Self-hosted font for date headings (see theme.css's --font-display).
// Only the weight actually used (500) is imported, to avoid shipping
// unused font files.
import "@fontsource/fraunces/500.css";

// Order matters: tokens.css defines the CSS custom properties every other
// stylesheet consumes via var().
import "./styles/index.css";
import "./lib/theme";
import AppRouter from "./lib/router";
import AuthGate from "./lib/auth";

render(
  () => (
    <>
      <AuthGate>
        <AppRouter />
      </AuthGate>
    </>
  ),
  document.getElementById("root") as HTMLElement,
);

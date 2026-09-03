import { createSignal } from "solid-js";

// "system" means no explicit override: the app just follows the
// OS/browser preference via the <meta name="color-scheme"> tag in
// index.html, same as before this file existed.
export type Theme = "light" | "dark" | "system";

const STORAGE_KEY = "theme";

function readStoredTheme(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === "light" || stored === "dark" ? stored : "system";
}

// Toggles the .light/.dark class on <html> (see the :root.light /
// :root.dark rules in styles/theme.css). Neither class present is
// "system": color-scheme then falls back to the OS preference.
function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("light", theme === "light");
  document.documentElement.classList.toggle("dark", theme === "dark");
}

// Module-level signal, applied immediately on import (see main.tsx) so
// the correct theme is set before the first paint, not just once
// ThemeToggle happens to mount.
const [theme, setThemeSignal] = createSignal<Theme>(readStoredTheme());
applyTheme(theme());

export const currentTheme = theme;

export function setTheme(next: Theme): void {
  localStorage.setItem(STORAGE_KEY, next);
  applyTheme(next);
  setThemeSignal(next);
}

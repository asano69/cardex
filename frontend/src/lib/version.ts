import { createResource } from "solid-js";

// Fetches the running server version from the public, unauthenticated
// /api/version endpoint (see internal/serve/handler.go). Shared so
// every component that needs to display it (Logo, Sidebar's footer)
// uses the same fetch implementation instead of duplicating it.
export function useVersion() {
  const [version] = createResource(async () => {
    const res = await fetch("/api/version");
    const data = await res.json();
    return data.version;
  });
  return version;
}

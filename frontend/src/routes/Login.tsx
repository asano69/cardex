import { createSignal } from "solid-js";

import Logo from "../components/Logo";

import pb from "../lib/pb";

// Login screen shown by AuthGate when no valid superuser session exists.
// This app is single-user, so the PocketBase superuser account also
// serves as the app's only login; there is no separate "users" collection.
export default function Login() {
  const [email, setEmail] = createSignal("");
  const [password, setPassword] = createSignal("");
  const [error, setError] = createSignal("");
  const [pending, setPending] = createSignal(false);

  const handleSubmit = async (e: SubmitEvent) => {
    e.preventDefault();
    setError("");
    setPending(true);
    try {
      await pb.collection("_superusers").authWithPassword(email(), password());
      // No further action needed here: AuthGate subscribes to
      // pb.authStore.onChange and swaps this screen for the app once the
      // token is stored.
    } catch {
      setError("Invalid email or password.");
    } finally {
      setPending(false);
    }
  };

  return (
    <div class="flex min-h-screen w-full items-center justify-center bg-bg px-6 text-text">
      <form
        onSubmit={handleSubmit}
        class="flex w-full max-w-sm flex-col gap-4 rounded-md border border-border bg-field p-8 shadow-card"
      >
        <div class="flex justify-center">
          <Logo size={40} showTitle />
        </div>
        <input
          type="email"
          placeholder="Email"
          value={email()}
          onInput={(e) => setEmail(e.currentTarget.value)}
          required
          autofocus
          class="rounded-md border border-border bg-bg px-3 py-2 text-text"
        />
        <input
          type="password"
          placeholder="Password"
          value={password()}
          onInput={(e) => setPassword(e.currentTarget.value)}
          required
          class="rounded-md border border-border bg-bg px-3 py-2 text-text"
        />
        {error() && <p class="text-sm text-[#dc3545]">{error()}</p>}
        <button type="submit" class="btn" disabled={pending()}>
          {pending() ? "Logging in…" : "Log in"}
        </button>
      </form>
    </div>
  );
}

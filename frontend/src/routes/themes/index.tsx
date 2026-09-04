import { createSignal, onMount, For } from "solid-js";

import pb from "../../lib/pb";
import ThemeItem from "./ThemeItem";
import ThemeForm from "./ThemeForm";
import type { ThemeRecord } from "./ThemeForm";

// Themes is a list of topics the user wants to think about: an
// add-theme input followed by the list, each with a done/not-done
// state, inline rename, and delete. Every mutation (add/toggle/
// rename/delete) is owned by the component that triggers it
// (ThemeForm/ThemeItem); this page only holds the loaded list and
// re-syncs it from whatever record each mutation reports back.
export default function Themes() {
  const [themes, setThemes] = createSignal<ThemeRecord[]>([]);

  const loadThemes = async () => {
    try {
      const result = await pb
        .collection("themes")
        .getFullList<ThemeRecord>({ sort: "created" });
      setThemes(result);
    } catch (err) {
      console.error("[themes] failed to load themes:", err);
    }
  };

  onMount(loadThemes);

  // Position for a newly created theme: one past the current highest
  // position, so it's always appended at the end regardless of any
  // gaps left by earlier deletes.
  const nextPosition = () =>
    themes().length === 0
      ? 0
      : Math.max(...themes().map((t) => t.position)) + 1;

  const handleAdded = (record: ThemeRecord) => {
    setThemes((prev) => [...prev, record]);
  };

  const handleChanged = (record: ThemeRecord) => {
    setThemes((prev) => prev.map((t) => (t.id === record.id ? record : t)));
  };

  const handleDeleted = (theme: ThemeRecord) => {
    setThemes((prev) => prev.filter((t) => t.id !== theme.id));
  };

  return (
    <div class="flex w-full flex-col gap-4">
      <h1 class="mb-4 font-sans text-4xl">Themes</h1>

      <ThemeForm
        hasExistingThemes={themes().length > 0}
        nextPosition={nextPosition()}
        onAdded={handleAdded}
      />
      <div class="flex flex-col gap-2">
        <For each={themes()}>
          {(theme) => (
            <ThemeItem
              theme={theme}
              onChanged={handleChanged}
              onDeleted={handleDeleted}
            />
          )}
        </For>
      </div>
    </div>
  );
}

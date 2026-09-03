import { createMemo, createResource, createSignal, Show } from "solid-js";

import pb from "../../lib/pb";
import { formatDisplayDate, shiftDate, todayDate } from "../../lib/date";
import Heatmap from "../../components/Heatmap";
import type { FocusTaskRecord } from "./FocusTaskForm";

// Number of full weeks (Sun-Sat) shown, roughly a year of history
// (GitHub's contribution graph shows the same span).
const WEEKS_TO_SHOW = 52;

type RateCategory = "none" | "0" | "33" | "50" | "66" | "100" | "future";

// Maps each category straight to a CSS custom property (see
// --color-heat-* in styles/theme.css).
const CATEGORY_COLORS: Record<RateCategory, string> = {
  none: "var(--color-heat-empty)",
  "0": "var(--color-heat-0)",
  "33": "var(--color-heat-33)",
  "50": "var(--color-heat-50)",
  "66": "var(--color-heat-66)",
  "100": "var(--color-heat-100)",
  // Days after today have no data yet, so they're transparent rather
  // than the "no tasks" gray, matching GitHub's contribution graph.
  future: "transparent",
};

// The achievement rate is derived from (done, total) directly instead
// of a rounded done/total ratio: FocusTaskForm caps total at MAX_TASKS
// (3), so every reachable rate (0, 1/3, 1/2, 2/3, 1) already has an
// exact match below -- what matters is the rate, not the raw count, so
// e.g. 1/1 (100%) ranks above 2/3 (66%).
function rateCategory(done: number, total: number): RateCategory {
  if (total === 0) return "none";
  if (done === 0) return "0";
  if (done === total) return "100";
  if (total === 2) return "50"; // done === 1
  if (done === 1) return "33"; // total === 3, done === 1
  return "66"; // total === 3, done === 2
}

async function fetchRecentTasks(rangeStart: string) {
  return await pb.collection("focus_tasks").getFullList<FocusTaskRecord>({
    filter: pb.filter("date >= {:start}", { start: rangeStart }),
    // Without this, this request and the day-list fetch in
    // routes/focus/index.tsx share the same default request key (both
    // hit /focus_tasks), so PocketBase's auto-cancellation aborts
    // whichever one resolves second. This fetch covers a much wider
    // date range and isn't a duplicate of that one, so it opts out.
    requestKey: null,
  });
}

export interface FocusHeatmapProps {
  // Bumped by the parent whenever a task is added, toggled, or
  // deleted, so this component refetches instead of showing stale
  // achievement rates (it fetches its own data, separately from the
  // parent's day-by-day task list).
  refreshKey?: number;
}

// Focus-specific wrapper around the generic Heatmap component (see
// components/Heatmap.tsx): fetches focus_tasks and derives a
// per-day achievement rate, leaving the actual grid rendering to the
// reusable component. Fetches its own data (like TagSelect fetches
// diary_tags), since it covers a much wider date range than the
// day-by-day task list above it.
export default function FocusHeatmap(props: FocusHeatmapProps) {
  const rangeStart = shiftDate(todayDate(), -(WEEKS_TO_SHOW - 1) * 7);
  // refreshKey is the resource's reactive source: whenever it changes,
  // the fetcher re-runs. rangeStart itself never changes, so it's read
  // from the closure instead of being part of the source.
  const [tasks] = createResource(
    () => props.refreshKey,
    () => fetchRecentTasks(rangeStart),
  );
  const [selected, setSelected] = createSignal<string | null>(null);

  const byDate = createMemo(() => {
    const map = new Map<string, { done: number; total: number }>();
    for (const task of tasks() ?? []) {
      const entry = map.get(task.date) ?? { done: 0, total: 0 };
      entry.total += 1;
      if (task.done) entry.done += 1;
      map.set(task.date, entry);
    }
    return map;
  });

  // Captured once: "future" is relative to when the page loaded, not
  // something that needs to react to the clock ticking over midnight.
  const today = todayDate();

  const getCategory = (date: string): RateCategory => {
    if (date > today) return "future";
    const { done = 0, total = 0 } = byDate().get(date) ?? {};
    return rateCategory(done, total);
  };

  const getTooltip = (date: string) => {
    const { done = 0, total = 0 } = byDate().get(date) ?? {};
    return `${date}: ${total === 0 ? "no tasks" : `${done}/${total} done`}`;
  };

  const selectedStats = createMemo(() => {
    const date = selected();
    if (!date) return null;
    return { date, ...(byDate().get(date) ?? { done: 0, total: 0 }) };
  });

  return (
    <div class="flex flex-col gap-2 rounded-md border border-border p-2">
      <Heatmap
        weeksToShow={WEEKS_TO_SHOW}
        getCategory={getCategory}
        colors={CATEGORY_COLORS}
        getTooltip={getTooltip}
        onSelect={setSelected}
      />

      <p class="h-5 text-sm text-text">
        <Show
          when={selectedStats()}
          fallback="Hover or tap a day to see details."
        >
          {(day) => (
            <>
              {formatDisplayDate(day().date)}:{" "}
              {day().total === 0
                ? "no tasks created"
                : `${day().done}/${day().total} tasks done (${Math.round(
                    (day().done / day().total) * 100,
                  )}%)`}
            </>
          )}
        </Show>
      </p>
    </div>
  );
}

import { createMemo, For } from "solid-js";
import { dayOfWeek, shiftDate, todayDate } from "../lib/date";

export interface HeatmapProps {
  // Number of full weeks (Sun-Sat) to display, ending on the most
  // recent Sunday-Saturday week that includes today.
  weeksToShow?: number;
  // Returns the category key for a given "YYYY-MM-DD" date. The
  // returned key must have a matching entry in `colors`.
  getCategory: (date: string) => string;
  // Maps each category key to a CSS color (any valid CSS color value,
  // e.g. a hex code or a var(--...) reference).
  colors: Record<string, string>;
  // Optional per-day tooltip text (native title attribute).
  getTooltip?: (date: string) => string;
  // Called when a day cell is hovered or clicked.
  onSelect?: (date: string) => void;
  // Formats a month index (0-11) for the month-label row. Defaults to
  // a fixed 3-letter English abbreviation.
  formatMonth?: (monthIndex: number) => string;
  // Labels for each weekday row (index 0 = Sunday ... 6 = Saturday).
  // Defaults to Mon/Wed/Fri only, GitHub-style.
  weekdayLabels?: string[];
}

const DEFAULT_WEEKS = 52;

const DEFAULT_MONTH_ABBREVIATIONS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// Only every other row is labeled (Mon/Wed/Fri), matching GitHub's own
// contribution graph.
const DEFAULT_WEEKDAY_LABELS = ["", "Mon", "", "Wed", "", "Fri", ""];

// First Sunday on or before `date`.
function startOfWeek(date: string): string {
  return shiftDate(date, -dayOfWeek(date));
}

// Generic GitHub-style contribution calendar: a row of week-columns,
// each holding 7 day-cells colored by category. This component has no
// knowledge of what a "day" represents in the calling app -- category,
// tooltip, color, and any selected-day display are all owned by the
// caller, so it can be dropped into any project that wants a calendar
// heatmap.
export default function Heatmap(props: HeatmapProps) {
  const weeksToShow = () => props.weeksToShow ?? DEFAULT_WEEKS;
  const weekdayLabels = () => props.weekdayLabels ?? DEFAULT_WEEKDAY_LABELS;
  const formatMonth = (monthIndex: number) =>
    (props.formatMonth ?? ((i: number) => DEFAULT_MONTH_ABBREVIATIONS[i]))(
      monthIndex,
    );

  const rangeStart = createMemo(() =>
    startOfWeek(shiftDate(todayDate(), -(weeksToShow() - 1) * 7)),
  );

  // Flat list of "YYYY-MM-DD" dates, reshaped into columns of 7
  // (Sun-Sat), one per week, so the markup below can render a plain
  // row-of-columns flexbox.
  const weeks = createMemo(() => {
    const start = rangeStart();
    const days: string[] = [];
    for (let i = 0; i < weeksToShow() * 7; i++) {
      days.push(shiftDate(start, i));
    }
    const result: string[][] = [];
    for (let i = 0; i < days.length; i += 7) {
      result.push(days.slice(i, i + 7));
    }
    return result;
  });

  // One label per week column: the month name whenever a week's Sunday
  // falls in a different month than the previous week's Sunday (and
  // always for the very first column), blank otherwise.
  const monthLabels = createMemo(() => {
    return weeks().map((week, i) => {
      const sunday = week[0];
      const month = sunday.slice(5, 7);
      if (i === 0) return formatMonth(Number(month) - 1);
      const prevMonth = weeks()[i - 1][0].slice(5, 7);
      return month !== prevMonth ? formatMonth(Number(month) - 1) : "";
    });
  });

  return (
    // overflow-x-auto guards against narrow viewports, since a full
    // year of weeks can run wider than the page on small screens.
    <div class="overflow-x-auto">
      <div class="flex w-max flex-col gap-0.5">
        {/* Month labels row. The leading spacer matches the weekday
            label column's width+gap below so columns line up. */}
        <div class="flex gap-0.5">
          <div class="w-6 shrink-0" />
          <For each={monthLabels()}>
            {(label) => (
              <span class="w-3 shrink-0 overflow-visible text-[12px] whitespace-nowrap">
                {label}
              </span>
            )}
          </For>
        </div>

        <div class="flex gap-0.5">
          <div class="flex w-6 shrink-0 flex-col gap-0.5">
            <For each={weekdayLabels()}>
              {(label) => (
                <span class="h-3 text-[12px] leading-[12px]">{label}</span>
              )}
            </For>
          </div>

          <For each={weeks()}>
            {(week) => (
              <div class="flex shrink-0 flex-col gap-0.5">
                <For each={week}>
                  {(date) => (
                    <div
                      class="heat-cell"
                      style={{
                        "background-color": props.colors[props.getCategory(date)],
                      }}
                      title={props.getTooltip?.(date)}
                      onMouseEnter={() => props.onSelect?.(date)}
                      onClick={() => props.onSelect?.(date)}
                    />
                  )}
                </For>
              </div>
            )}
          </For>
        </div>
      </div>
    </div>
  );
}

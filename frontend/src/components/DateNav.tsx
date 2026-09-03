import {
  ChevronsLeft as ChevronLeft,
  ChevronsRight as ChevronRight,
} from "../lib/icons";

import {
  dayOfWeek,
  formatDisplayDate,
  shiftDate,
  WEEKDAY_ABBREVIATIONS,
} from "../lib/date";

export interface DateNavProps {
  date: string; // "YYYY-MM-DD"
  onChange: (date: string) => void;
}

// Shared day-by-day navigator: chevron buttons on either side of the
// currently selected date, formatted for display. Used by Focus, Sleep,
// and Diary so all three pages navigate dates the same way.
export default function DateNav(props: DateNavProps) {
  const changeDate = (days: number) => {
    props.onChange(shiftDate(props.date, days));
  };

  // Native <input type="date">'s "click to open the picker" hit area is
  // only the browser-drawn calendar icon, not the whole element -- even
  // with the input stretched over the label via CSS. Opening the picker
  // programmatically via showPicker() instead lets the entire label
  // area (see the span's onClick below) trigger it.
  let dateInputRef: HTMLInputElement | undefined;
  const openDatePicker = () => {
    dateInputRef?.showPicker?.();
  };

  return (
    // Sticky "second bar" right under TopBar: sticks to the top of
    // <main>'s own scroll area (see MainLayout) once the page scrolls
    // past it, so date navigation stays visible without every page
    // needing its own header row.
    <div class="sticky flex items-center justify-center gap-3">
      <button
        type="button"
        aria-label="Previous day"
        class="icon-btn"
        onClick={() => changeDate(-1)}
      >
        <ChevronLeft size={20} />
      </button>
      {/* inline-block (not the default inline) so this forms a single
          box for the absolutely positioned date input below to align
          against. The click itself is handled by openDatePicker above,
          not by the input's own hit area (see the comment there). */}
      <span
        class="relative inline-block cursor-pointer font-serif text-lg"
        onClick={openDatePicker}
      >
        {WEEKDAY_ABBREVIATIONS[dayOfWeek(props.date)]},{" "}
        {formatDisplayDate(props.date)}
        {/* pointer-events-none: this input never receives clicks
            directly (see openDatePicker above) -- it only exists to
            hold the value and be opened via showPicker(). */}
        <input
          ref={dateInputRef}
          type="date"
          value={props.date}
          onInput={(e) => props.onChange(e.currentTarget.value)}
          class="pointer-events-none absolute inset-0 h-full w-full opacity-0"
          tabIndex={-1}
          aria-hidden="true"
        />
      </span>
      <button
        type="button"
        aria-label="Next day"
        class="icon-btn"
        onClick={() => changeDate(1)}
      >
        <ChevronRight size={20} />
      </button>
    </div>
  );
}

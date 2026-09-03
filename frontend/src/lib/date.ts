// frontend/src/lib/date.ts
// Fixed 3-letter abbreviations for display, instead of
// Intl.DateTimeFormat's "short" month: the en-GB locale renders
// September as "Sept" (four letters) while every other month is
// three letters, which reads inconsistently in a compact date like
// "1 Sept 2026".
export const MONTH_ABBREVIATIONS: readonly string[] = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

// 3-letter weekday abbreviations, indexed the same way as dayOfWeek()
// below (0 = Sunday ... 6 = Saturday).
export const WEEKDAY_ABBREVIATIONS: readonly string[] = [
  "Sun",
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
];

// Converts a stored date string ("YYYY-MM-DD") into its display form
// (currently "17 Jul 2026"). Storage keeps the hyphenated ISO form
// since it's what sorts and filters correctly in PocketBase queries;
// only the rendered text changes here. Built directly from the parts
// instead of Date + Intl.DateTimeFormat, which also sidesteps the
// "Sept" quirk above and any UTC/local timezone shift.
export function formatDisplayDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return `${day} ${MONTH_ABBREVIATIONS[month - 1]} ${year}`;
}

// Shifts a "YYYY-MM-DD" date string by the given number of days
// (positive or negative), returning the result in the same
// "YYYY-MM-DD" format. Parsed/shifted in UTC (see formatDisplayDate
// above) so day-of-month arithmetic doesn't drift across timezones
// behind UTC.
export function shiftDate(date: string, days: number): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

// Today's date as "YYYY-MM-DD", the storage format used throughout the
// app (see formatDisplayDate above for the human-readable form).
export function todayDate(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

// Day of week for a "YYYY-MM-DD" date string: 0 = Sunday ... 6 =
// Saturday. Parsed as UTC (see shiftDate/formatDisplayDate above) so it
// stays consistent with the rest of this module.
export function dayOfWeek(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

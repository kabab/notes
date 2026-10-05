// Calendar dates as `YYYY-MM-DD` strings in the user's local time zone.
// Arithmetic goes through UTC so DST changes can't shift a day.

const pad = (n: number) => String(n).padStart(2, "0");

/** Today's local date. */
export function todayISO(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function isValidISODate(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

function toUTC(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d));
}

function fromUTC(date: Date): string {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

export function addDays(iso: string, days: number): string {
  const date = toUTC(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return fromUTC(date);
}

/** A month, as `YYYY-MM`. */
export const monthOf = (iso: string) => iso.slice(0, 7);

export function addMonths(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const date = new Date(Date.UTC(y, m - 1 + n, 1));
  return fromUTC(date).slice(0, 7);
}

/**
 * The weeks to show for a month view: full weeks (Monday first) covering the month.
 * Each week is 7 ISO dates; days outside the month are included to fill the rows.
 */
export function monthGrid(month: string): string[][] {
  const first = toUTC(`${month}-01`);
  const offset = (first.getUTCDay() + 6) % 7; // days since Monday
  let day = addDays(`${month}-01`, -offset);
  const weeks: string[][] = [];
  do {
    const week: string[] = [];
    for (let i = 0; i < 7; i++) {
      week.push(day);
      day = addDays(day, 1);
    }
    weeks.push(week);
  } while (monthOf(day) === month);
  return weeks;
}

/** e.g. "Monday, 5 October 2026" in the user's locale. */
export function formatLongDate(iso: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "full", timeZone: "UTC" }).format(toUTC(iso));
}

/** e.g. "October 2026". */
export function formatMonth(month: string): string {
  return new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric", timeZone: "UTC" }).format(
    toUTC(`${month}-01`),
  );
}

/** Narrow weekday labels, Monday first (e.g. M T W T F S S). */
export function weekdayLabels(): string[] {
  const fmt = new Intl.DateTimeFormat(undefined, { weekday: "narrow", timeZone: "UTC" });
  return Array.from({ length: 7 }, (_, i) => fmt.format(toUTC(addDays("2024-01-01", i)))); // 2024-01-01 is a Monday
}

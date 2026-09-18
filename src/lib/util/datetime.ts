/**
 * Timezone helpers.
 *
 * The model does the calendar reasoning ("next Tuesday" -> a date), but it can
 * only do that correctly if we hand it an unambiguous "now" in the user's own
 * timezone. These helpers produce exactly that, using Intl so no timezone
 * database dependency is needed.
 */

export function isValidTimeZone(timeZone: string): boolean {
  if (!timeZone) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** Offset of `timeZone` from UTC, in minutes, at the given instant. */
export function timeZoneOffsetMinutes(date: Date, timeZone: string): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = formatter.formatToParts(date);
  const lookup = (type: Intl.DateTimeFormatPartTypes): number => {
    const part = parts.find((candidate) => candidate.type === type);
    return part ? Number(part.value) : 0;
  };
  // `hour` can come back as 24 for midnight under hour12:false in some engines.
  const hour = lookup('hour') % 24;
  const asUtc = Date.UTC(
    lookup('year'),
    lookup('month') - 1,
    lookup('day'),
    hour,
    lookup('minute'),
    lookup('second'),
  );
  return Math.round((asUtc - date.getTime()) / 60_000);
}

function pad(value: number, length = 2): string {
  return String(Math.abs(value)).padStart(length, '0');
}

export function formatOffset(offsetMinutes: number): string {
  const sign = offsetMinutes >= 0 ? '+' : '-';
  return `${sign}${pad(Math.trunc(offsetMinutes / 60))}:${pad(offsetMinutes % 60)}`;
}

/** ISO-8601 string with the user's local wall clock and offset, e.g. 2026-09-18T17:20:00+09:00 */
export function toIsoInTimeZone(date: Date, timeZone: string): string {
  const offsetMinutes = timeZoneOffsetMinutes(date, timeZone);
  const shifted = new Date(date.getTime() + offsetMinutes * 60_000);
  const iso = shifted.toISOString().slice(0, 19);
  return `${iso}${formatOffset(offsetMinutes)}`;
}

/** Weekday name in the user's timezone - handed to the model so "this Friday" is anchored. */
export function weekdayInTimeZone(date: Date, timeZone: string, locale = 'en-US'): string {
  return new Intl.DateTimeFormat(locale, { timeZone, weekday: 'long' }).format(date);
}

/** Human-readable range used by the preview card, rendered server- and client-side alike. */
export function formatEventRange(
  startIso: string,
  endIso: string,
  allDay: boolean,
  timeZone: string,
  locale = 'en-US',
): { date: string; time: string | null } {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const date = new Intl.DateTimeFormat(locale, {
    timeZone,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(start);

  if (allDay) return { date, time: null };

  const timeFormatter = new Intl.DateTimeFormat(locale, {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
  });
  return { date, time: `${timeFormatter.format(start)} - ${timeFormatter.format(end)}` };
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

export function isValidIsoDateTime(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?([.]\d+)?(Z|[+-]\d{2}:\d{2})?$/.test(value)) {
    return false;
  }
  return !Number.isNaN(new Date(value).getTime());
}

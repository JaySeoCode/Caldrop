/**
 * Recurrence rules (RFC 5545 RRULE), restricted to what CalDrop can explain.
 *
 * The model proposes a rule as text, so it is parsed here before it can reach
 * Google: an unknown part is a refusal, never a pass-through. A rule the user
 * cannot read in the preview is a rule they cannot judge, which is why
 * `describeRecurrence` covers exactly the shapes `parseRecurrence` accepts.
 */

const FREQUENCIES = ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'] as const;
const WEEKDAYS = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'] as const;

type Frequency = (typeof FREQUENCIES)[number];
type Weekday = (typeof WEEKDAYS)[number];

/** Bounds a single proposal to something a person can still review. */
export const MAX_OCCURRENCES = 500;
const MAX_INTERVAL = 52;

const UNTIL_RE = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/;

export interface ParsedRecurrence {
  /** Normalised rule, always prefixed with `RRULE:`; what Google is given. */
  rule: string;
  freq: Frequency;
  interval: number;
  byDay: Weekday[];
  /** UTC instant the recurrence stops, in RRULE basic format. */
  until: string | null;
  count: number | null;
}

function parseUntil(value: string): string | null {
  const match = UNTIL_RE.exec(value);
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match;
  const asDate = new Date(
    `${year}-${month}-${day}T${hour}:${minute}:${second}Z`,
  );
  return Number.isNaN(asDate.getTime()) ? null : value;
}

/**
 * Parses a proposed rule. Returns null for anything unrecognised, including
 * parts that are valid RFC 5545 but that the preview could not describe.
 */
export function parseRecurrence(raw: string): ParsedRecurrence | null {
  const body = raw.trim().replace(/^RRULE:/i, '');
  if (!body) return null;

  let freq: Frequency | null = null;
  let interval = 1;
  let byDay: Weekday[] = [];
  let until: string | null = null;
  let count: number | null = null;

  for (const part of body.split(';')) {
    if (!part) continue;
    const [rawKey = '', rawValue = ''] = part.split('=');
    const key = rawKey.trim().toUpperCase();
    const value = rawValue.trim().toUpperCase();
    if (!value) return null;

    switch (key) {
      case 'FREQ': {
        if (!(FREQUENCIES as readonly string[]).includes(value)) return null;
        freq = value as Frequency;
        break;
      }
      case 'INTERVAL': {
        const parsed = Number(value);
        if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_INTERVAL) return null;
        interval = parsed;
        break;
      }
      case 'BYDAY': {
        const days = value.split(',').map((day) => day.trim());
        if (days.some((day) => !(WEEKDAYS as readonly string[]).includes(day))) return null;
        byDay = days as Weekday[];
        break;
      }
      case 'UNTIL': {
        until = parseUntil(value);
        if (!until) return null;
        break;
      }
      case 'COUNT': {
        const parsed = Number(value);
        if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_OCCURRENCES) return null;
        count = parsed;
        break;
      }
      default:
        // WKST, BYSETPOS, EXDATE and friends: not described in the preview, so
        // not accepted here either.
        return null;
    }
  }

  if (!freq) return null;
  // An open-ended rule would put an event on the user's calendar forever.
  if (!until && !count) return null;
  if (until && count) return null;
  if (byDay.length > 0 && freq !== 'WEEKLY') return null;

  const parts = [`FREQ=${freq}`];
  if (interval > 1) parts.push(`INTERVAL=${interval}`);
  if (byDay.length > 0) parts.push(`BYDAY=${byDay.join(',')}`);
  if (until) parts.push(`UNTIL=${until}`);
  if (count) parts.push(`COUNT=${count}`);

  return { rule: `RRULE:${parts.join(';')}`, freq, interval, byDay, until, count };
}

export function isValidRecurrence(raw: string): boolean {
  return parseRecurrence(raw) !== null;
}

const DAY_LABELS: Record<Weekday, string> = {
  MO: 'Mon',
  TU: 'Tue',
  WE: 'Wed',
  TH: 'Thu',
  FR: 'Fri',
  SA: 'Sat',
  SU: 'Sun',
};

const UNIT: Record<Frequency, string> = {
  DAILY: 'day',
  WEEKLY: 'week',
  MONTHLY: 'month',
  YEARLY: 'year',
};

/** Plain-English summary of a rule, e.g. "Every 2 weeks on Tue, Thu until Jun 15, 2026". */
export function describeRecurrence(raw: string, timeZone: string): string | null {
  const parsed = parseRecurrence(raw);
  if (!parsed) return null;

  const every =
    parsed.interval === 1
      ? { DAILY: 'Daily', WEEKLY: 'Weekly', MONTHLY: 'Monthly', YEARLY: 'Yearly' }[parsed.freq]
      : `Every ${parsed.interval} ${UNIT[parsed.freq]}s`;

  const on =
    parsed.byDay.length > 0
      ? ` on ${parsed.byDay.map((day) => DAY_LABELS[day]).join(', ')}`
      : '';

  let ends = '';
  if (parsed.count) {
    ends = `, ${parsed.count} times`;
  } else if (parsed.until) {
    const match = UNTIL_RE.exec(parsed.until);
    if (match) {
      const [, year, month, day, hour, minute, second] = match;
      const date = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}Z`);
      ends = ` until ${new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      }).format(date)}`;
    }
  }

  return `${every}${on}${ends}`;
}

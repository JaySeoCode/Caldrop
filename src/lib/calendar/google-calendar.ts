/**
 * Google Calendar API wrapper.
 *
 * Deliberately dependency-free (plain fetch) so the exact requests, scopes and
 * failure modes are visible. Every function takes an access token obtained
 * server-side; nothing here ever runs in the browser.
 */
import 'server-only';
import { AppError } from '@/lib/util/errors';
import { invalidateAccessToken } from '@/lib/auth/google-tokens';
import type { CalendarEvent } from '@/types';
import type { EventWritePayload, GoogleEvent, GoogleEventList } from '@/lib/calendar/types';

const BASE_URL = 'https://www.googleapis.com/calendar/v3';
const PRIMARY = 'primary';

export interface CalendarContext {
  userId: string;
  accessToken: string;
  timeZone: string;
}

async function callCalendar<T>(
  ctx: CalendarContext,
  path: string,
  init: RequestInit & { query?: Record<string, string | undefined> } = {},
): Promise<T> {
  const url = new URL(`${BASE_URL}${path}`);
  for (const [key, value] of Object.entries(init.query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, value);
  }

  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${ctx.accessToken}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
    cache: 'no-store',
  });

  if (response.status === 204) return undefined as T;

  if (!response.ok) {
    const body = await response.text();
    if (response.status === 401) {
      invalidateAccessToken(ctx.userId);
      throw new AppError(
        'CALENDAR_NOT_CONNECTED',
        'Google rejected the calendar credentials. Please reconnect your calendar.',
      );
    }
    if (response.status === 403) {
      throw new AppError('FORBIDDEN', 'Google Calendar denied this operation.');
    }
    if (response.status === 404) {
      throw new AppError('NOT_FOUND', 'That calendar event no longer exists.');
    }
    if (response.status === 429 || response.status >= 500) {
      throw new AppError('CALENDAR_FAILED', 'Google Calendar is busy. Please try again.');
    }
    throw new AppError('CALENDAR_FAILED', `Google Calendar error (${response.status}).`, {
      cause: body.slice(0, 300),
    });
  }

  return (await response.json()) as T;
}

function toCalendarEvent(event: GoogleEvent): CalendarEvent {
  const allDay = Boolean(event.start?.date);
  const start = event.start?.dateTime ?? event.start?.date ?? '';
  const end = event.end?.dateTime ?? event.end?.date ?? '';
  return {
    id: event.id,
    title: event.summary ?? '(no title)',
    start,
    end,
    allDay,
    location: event.location ?? null,
    description: event.description ?? null,
    htmlLink: event.htmlLink ?? null,
    status: event.status ?? null,
    organizerSelf: Boolean(event.organizer?.self ?? event.creator?.self),
    recurrence: event.recurrence?.[0] ?? null,
    canEdit: Boolean(event.organizer?.self ?? event.creator?.self ?? event.guestsCanModify),
  };
}

function toGoogleDates(payload: EventWritePayload): Pick<GoogleEvent, 'start' | 'end'> {
  if (payload.allDay) {
    return {
      start: { date: payload.start.slice(0, 10) },
      end: { date: payload.end.slice(0, 10) },
    };
  }
  return {
    start: { dateTime: payload.start, timeZone: payload.timeZone },
    end: { dateTime: payload.end, timeZone: payload.timeZone },
  };
}

/** Events in [timeMin, timeMax), expanded to single instances, ordered by start. */
export async function listEvents(
  ctx: CalendarContext,
  options: { timeMin: string; timeMax: string; maxResults?: number; query?: string },
): Promise<CalendarEvent[]> {
  const data = await callCalendar<GoogleEventList>(ctx, `/calendars/${PRIMARY}/events`, {
    method: 'GET',
    query: {
      timeMin: new Date(options.timeMin).toISOString(),
      timeMax: new Date(options.timeMax).toISOString(),
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: String(Math.min(options.maxResults ?? 50, 250)),
      timeZone: ctx.timeZone,
      q: options.query,
    },
  });

  return (data.items ?? []).filter((item) => item.status !== 'cancelled').map(toCalendarEvent);
}

/**
 * Candidate events for an UPDATE/DELETE.
 *
 * Retrieval is intentionally wider than the keyword match - keywords only
 * re-rank - because the safest failure mode is "several candidates ->
 * NEED_CLARIFICATION", not "no candidate -> invented event id".
 */
export async function findCandidateEvents(
  ctx: CalendarContext,
  options: { timeMin: string; timeMax: string; keywords?: string[]; limit?: number },
): Promise<CalendarEvent[]> {
  const events = await listEvents(ctx, {
    timeMin: options.timeMin,
    timeMax: options.timeMax,
    maxResults: 50,
  });

  const keywords = (options.keywords ?? [])
    .map((keyword) => keyword.trim().toLowerCase())
    .filter((keyword) => keyword.length > 1);

  if (keywords.length === 0) return events.slice(0, options.limit ?? 20);

  const scored = events.map((event) => {
    const haystack =
      `${event.title} ${event.location ?? ''} ${event.description ?? ''}`.toLowerCase();
    const score = keywords.reduce(
      (total, keyword) => (haystack.includes(keyword) ? total + 1 : total),
      0,
    );
    return { event, score };
  });

  const matched = scored.filter((entry) => entry.score > 0);
  const pool = matched.length > 0 ? matched : scored;
  return pool
    .sort((a, b) => b.score - a.score)
    .slice(0, options.limit ?? 20)
    .map((entry) => entry.event);
}

export async function getEvent(ctx: CalendarContext, eventId: string): Promise<CalendarEvent> {
  const event = await callCalendar<GoogleEvent>(
    ctx,
    `/calendars/${PRIMARY}/events/${encodeURIComponent(eventId)}`,
    { method: 'GET' },
  );
  return toCalendarEvent(event);
}

export async function createEvent(
  ctx: CalendarContext,
  payload: EventWritePayload,
): Promise<CalendarEvent> {
  const event = await callCalendar<GoogleEvent>(ctx, `/calendars/${PRIMARY}/events`, {
    method: 'POST',
    body: JSON.stringify({
      summary: payload.title,
      location: payload.location ?? undefined,
      description: payload.description ?? undefined,
      recurrence: payload.recurrence ? [payload.recurrence] : undefined,
      ...toGoogleDates(payload),
    }),
  });
  return toCalendarEvent(event);
}

export async function updateEvent(
  ctx: CalendarContext,
  eventId: string,
  payload: EventWritePayload,
): Promise<CalendarEvent> {
  // PATCH, not PUT: attendees, reminders and conferencing data on the existing
  // event must survive an edit that only moves the time.
  const event = await callCalendar<GoogleEvent>(
    ctx,
    `/calendars/${PRIMARY}/events/${encodeURIComponent(eventId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        summary: payload.title,
        location: payload.location ?? undefined,
        description: payload.description ?? undefined,
        // Only sent when the proposal carries a rule, so a PATCH that just moves
        // the time leaves an existing series rule alone.
        recurrence: payload.recurrence ? [payload.recurrence] : undefined,
        ...toGoogleDates(payload),
      }),
    },
  );
  return toCalendarEvent(event);
}

export async function deleteEvent(ctx: CalendarContext, eventId: string): Promise<void> {
  await callCalendar<void>(ctx, `/calendars/${PRIMARY}/events/${encodeURIComponent(eventId)}`, {
    method: 'DELETE',
  });
}

/** Existing events overlapping [start, end). Used for the soft conflict warning. */
export async function findConflicts(
  ctx: CalendarContext,
  start: string,
  end: string,
  excludeEventId?: string,
): Promise<CalendarEvent[]> {
  const events = await listEvents(ctx, { timeMin: start, timeMax: end, maxResults: 20 });
  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();
  return events.filter((event) => {
    if (excludeEventId && event.id === excludeEventId) return false;
    if (event.allDay) return false;
    const eventStart = new Date(event.start).getTime();
    const eventEnd = new Date(event.end).getTime();
    return eventStart < endMs && eventEnd > startMs;
  });
}

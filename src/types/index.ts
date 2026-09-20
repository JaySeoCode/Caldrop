import type { CalendarAction, CalendarActionKind } from '@/schemas/calendar-action';

export type { CalendarAction, CalendarActionKind };

export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
  picture: string | null;
  timezone: string;
}

export interface UserRecord extends SessionUser {
  googleSub: string;
  createdAt: string;
}

/** Normalised Google Calendar event as used across CalDrop. */
export interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  location: string | null;
  description: string | null;
  htmlLink: string | null;
  status: string | null;
  organizerSelf: boolean;
  /** RRULE of the series this event belongs to, when it repeats. */
  recurrence: string | null;
  /** Google's own access role for this event, used for ownership checks. */
  canEdit: boolean;
}

export type InputType = 'text' | 'image' | 'pdf';

export interface AnalyzeResponse {
  requestId: string;
  action: CalendarAction;
  /** Candidate events retrieved for the model, echoed so the UI can explain choices. */
  candidates: CalendarEvent[];
  /** Existing events overlapping the proposed slot (shown as a soft warning). */
  conflicts: CalendarEvent[];
  /** CREATE_MANY: overlaps per proposed event, aligned with `action.events`. */
  eventConflicts: CalendarEvent[][];
  timezone: string;
  /** True when the input tried to issue instructions to the assistant. */
  injectionDetected: boolean;
}

/** Reply when the analysis was accepted and the result arrives as a notification. */
export interface BackgroundResponse {
  requestId: string;
  background: true;
}

/** One event of a multi-event proposal that could not be written. */
export interface ConfirmFailure {
  index: number;
  title: string;
  message: string;
}

export interface ConfirmResponse {
  requestId: string;
  action: CalendarActionKind;
  /** The single written event, for CREATE and UPDATE. */
  event: CalendarEvent | null;
  /** Everything actually written: one entry for CREATE/UPDATE, several for CREATE_MANY. */
  events: CalendarEvent[];
  deletedEventId: string | null;
  /** Non-empty when part of a multi-event proposal failed; the rest was still written. */
  failures: ConfirmFailure[];
}

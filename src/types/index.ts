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
  /** Google's own access role for this event, used for ownership checks. */
  canEdit: boolean;
}

export type InputType = 'text' | 'image';

export interface AnalyzeResponse {
  requestId: string;
  action: CalendarAction;
  /** Candidate events retrieved for the model, echoed so the UI can explain choices. */
  candidates: CalendarEvent[];
  /** Existing events overlapping the proposed slot (shown as a soft warning). */
  conflicts: CalendarEvent[];
  timezone: string;
  /** True when the input tried to issue instructions to the assistant. */
  injectionDetected: boolean;
}

export interface ConfirmResponse {
  requestId: string;
  action: CalendarActionKind;
  event: CalendarEvent | null;
  deletedEventId: string | null;
}

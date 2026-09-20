export interface GoogleEventDateTime {
  date?: string;
  dateTime?: string;
  timeZone?: string;
}

export interface GoogleEvent {
  id: string;
  status?: string;
  summary?: string;
  description?: string;
  location?: string;
  htmlLink?: string;
  start?: GoogleEventDateTime;
  end?: GoogleEventDateTime;
  organizer?: { self?: boolean; email?: string };
  creator?: { self?: boolean; email?: string };
  recurringEventId?: string;
  recurrence?: string[];
  guestsCanModify?: boolean;
}

export interface GoogleEventList {
  items?: GoogleEvent[];
  nextPageToken?: string;
}

export interface EventWritePayload {
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  location: string | null;
  description: string | null;
  timeZone: string;
  /** Normalised RRULE for a repeating event; null writes a single event. */
  recurrence: string | null;
}

/**
 * What a notification says.
 *
 * Pure, and deliberately free of transport concerns, because this is the only
 * thing the user sees when CalDrop writes to their calendar without them
 * watching: it must state exactly what happened, including what it skipped.
 */
import { formatEventRange } from '@/lib/util/datetime';
import { describeRecurrence } from '@/lib/util/rrule';
import type { CalendarAction } from '@/schemas/calendar-action';
import type { CalendarEvent } from '@/types';

/** Android collapses a long body; this keeps the first line readable anyway. */
const MAX_LISTED_EVENTS = 8;

export interface NotificationPayload {
  title: string;
  body: string;
  /** Present only when something was written and can still be taken back. */
  requestId: string | null;
  /** True when tapping should open the app because something needs the user. */
  needsAttention: boolean;
}

function line(event: CalendarEvent, timeZone: string): string {
  const range = formatEventRange(event.start, event.end, event.allDay, timeZone);
  const repeat = event.recurrence ? describeRecurrence(event.recurrence, timeZone) : null;
  const when = range.time ? `${range.date} ${range.time}` : range.date;
  return `${event.title} - ${when}${repeat ? ` (${repeat})` : ''}`;
}

/** The notification for a finished background analysis. */
export function buildNotification(input: {
  action: CalendarAction;
  written: CalendarEvent[];
  failures: Array<{ title: string; message: string }>;
  requestId: string;
  timeZone: string;
}): NotificationPayload {
  const { action, written, failures, requestId, timeZone } = input;

  if (written.length === 0) {
    if (action.action === 'NEED_CLARIFICATION') {
      return {
        title: 'CalDrop needs one detail',
        body: action.explanation,
        requestId: null,
        needsAttention: true,
      };
    }
    if (action.action === 'NO_ACTION') {
      return {
        title: 'Nothing to schedule',
        body: action.explanation,
        requestId: null,
        needsAttention: false,
      };
    }
    return {
      title: 'Nothing was added',
      body:
        failures[0]?.message ??
        'CalDrop could not add this to your calendar. Open the app to try again.',
      requestId: null,
      needsAttention: true,
    };
  }

  const listed = written.slice(0, MAX_LISTED_EVENTS).map((event) => line(event, timeZone));
  const remaining = written.length - listed.length;
  if (remaining > 0) listed.push(`and ${remaining} more`);
  if (failures.length > 0) {
    listed.push(`Skipped: ${failures.map((failure) => failure.title).join(', ')}`);
  }

  const title =
    action.action === 'UPDATE'
      ? 'Event updated'
      : written.length === 1
        ? 'Added to your calendar'
        : `${written.length} events added`;

  // Only a fresh CREATE can be taken back cleanly; an UPDATE would need the
  // previous version of the event, which is not stored.
  const undoable = action.action === 'CREATE' || action.action === 'CREATE_MANY';
  return {
    title,
    body: listed.join('\n'),
    requestId: undoable ? requestId : null,
    needsAttention: false,
  };
}

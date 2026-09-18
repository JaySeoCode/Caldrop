'use client';

import { formatEventRange } from '@/lib/util/datetime';
import type { CalendarAction } from '@/schemas/calendar-action';
import type { CalendarEvent } from '@/types';

const FIELD_LABELS: Record<string, string> = {
  title: 'Title',
  date: 'Date',
  start_time: 'Start time',
  end_time: 'End time',
  end: 'End time',
  duration: 'Duration',
  location: 'Location',
  description: 'Description',
  all_day: 'All-day',
  target_event: 'Which event',
};

const CONFIRM_LABEL: Record<string, string> = {
  CREATE: 'Add to Calendar',
  UPDATE: 'Update Calendar',
  DELETE: 'Delete Event',
};

interface PreviewCardProps {
  action: CalendarAction;
  candidates: CalendarEvent[];
  conflicts: CalendarEvent[];
  timezone: string;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function PreviewCard({
  action,
  candidates,
  conflicts,
  timezone,
  busy,
  onConfirm,
  onCancel,
}: PreviewCardProps) {
  const target =
    action.targetEventId != null
      ? candidates.find((candidate) => candidate.id === action.targetEventId) ?? null
      : null;

  const display = action.event
    ? {
        title: action.event.title,
        ...formatEventRange(
          action.event.start,
          action.event.end,
          action.event.allDay,
          timezone,
        ),
        location: action.event.location,
      }
    : target
      ? {
          title: target.title,
          ...formatEventRange(target.start, target.end, target.allDay, timezone),
          location: target.location,
        }
      : null;

  const before =
    action.action === 'UPDATE' && target
      ? formatEventRange(target.start, target.end, target.allDay, timezone)
      : null;

  return (
    <div className="card p-6">
      <div className="flex items-center justify-between">
        <span className="chip">{action.action}</span>
        <span className="text-xs text-ink-faint">
          confidence {Math.round(action.confidence * 100)}%
        </span>
      </div>

      {display ? (
        <div className="mt-4">
          <h2 className="text-xl font-semibold tracking-tight">{display.title}</h2>
          <p className="mt-2 text-sm text-ink-soft">{display.date}</p>
          {display.time ? (
            <p className="text-sm text-ink-soft">
              {display.time}
              {before && before.time && before.time !== display.time ? (
                <span className="ml-2 text-ink-faint line-through">{before.time}</span>
              ) : null}
            </p>
          ) : (
            <p className="text-sm text-ink-soft">All day</p>
          )}
          {display.location ? (
            <p className="mt-2 text-sm text-ink-soft">{display.location}</p>
          ) : null}
        </div>
      ) : null}

      <p className="mt-4 text-sm text-ink-soft">{action.explanation}</p>

      {action.inferredFields.length > 0 ? (
        <p className="mt-3 text-xs text-ink-faint">
          AI inferred: {action.inferredFields.map((field) => FIELD_LABELS[field] ?? field).join(', ')}
        </p>
      ) : null}

      {conflicts.length > 0 ? (
        <div className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <p className="font-medium">
            {conflicts.length === 1 ? 'An event already' : `${conflicts.length} events already`} overlap
            this time:
          </p>
          <ul className="mt-1 list-disc pl-5">
            {conflicts.map((conflict) => (
              <li key={conflict.id}>
                {conflict.title} - {formatEventRange(conflict.start, conflict.end, conflict.allDay, timezone).time}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-6 flex justify-end gap-2">
        <button type="button" className="btn-secondary" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button
          type="button"
          className={action.action === 'DELETE' ? 'btn-danger' : 'btn-primary'}
          onClick={onConfirm}
          disabled={busy}
        >
          {busy ? 'Working...' : CONFIRM_LABEL[action.action] ?? 'Confirm'}
        </button>
      </div>
    </div>
  );
}

export { FIELD_LABELS };

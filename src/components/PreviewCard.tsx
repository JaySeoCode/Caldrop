'use client';

import { useMemo, useState } from 'react';
import { formatEventRange } from '@/lib/util/datetime';
import { describeRecurrence } from '@/lib/util/rrule';
import type { CalendarAction, CalendarEventDraft } from '@/schemas/calendar-action';
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
  recurrence: 'Repeat',
};

const CONFIRM_LABEL: Record<string, string> = {
  CREATE: 'Add to Calendar',
  UPDATE: 'Update Calendar',
  DELETE: 'Delete Event',
};

/** Second-press label once the user has been shown an overlap. */
const CONFIRM_ANYWAY_LABEL: Record<string, string> = {
  CREATE: 'Add anyway',
  CREATE_MANY: 'Add anyway',
  UPDATE: 'Update anyway',
};

interface PreviewCardProps {
  action: CalendarAction;
  candidates: CalendarEvent[];
  conflicts: CalendarEvent[];
  /** CREATE_MANY: overlaps per proposed event, aligned with `action.events`. */
  eventConflicts: CalendarEvent[][];
  timezone: string;
  busy: boolean;
  /** For CREATE_MANY, the positions of the events the user kept ticked. */
  onConfirm: (eventIndexes?: number[]) => void;
  onCancel: () => void;
}

export function PreviewCard({
  action,
  candidates,
  conflicts,
  eventConflicts,
  timezone,
  busy,
  onConfirm,
  onCancel,
}: PreviewCardProps) {
  const isMulti = action.action === 'CREATE_MANY';

  // Everything the model found starts ticked; the user unticks what they do not
  // want. Only ticked events are ever sent to the confirm route.
  const [selected, setSelected] = useState<Set<number>>(
    () => new Set(action.events.map((_, index) => index)),
  );
  // An overlap takes two presses: the first only arms the confirm button, so a
  // double-booking is always a deliberate choice rather than a reflex tap.
  const [overlapAcknowledged, setOverlapAcknowledged] = useState(false);

  const selectedOverlaps = useMemo(() => {
    if (!isMulti) return conflicts.length;
    return [...selected].reduce(
      (total, index) => total + (eventConflicts[index]?.length ?? 0),
      0,
    );
  }, [isMulti, conflicts.length, eventConflicts, selected]);

  const needsOverlapAck = selectedOverlaps > 0 && !overlapAcknowledged;
  const nothingSelected = isMulti && selected.size === 0;

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
        repeat: action.event.recurrence
          ? describeRecurrence(action.event.recurrence, timezone)
          : null,
      }
    : target
      ? {
          title: target.title,
          ...formatEventRange(target.start, target.end, target.allDay, timezone),
          location: target.location,
          repeat: null,
        }
      : null;

  const before =
    action.action === 'UPDATE' && target
      ? formatEventRange(target.start, target.end, target.allDay, timezone)
      : null;

  const toggle = (index: number) => {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
    // Unticking the overlapping event should not leave the button armed.
    setOverlapAcknowledged(false);
  };

  const describeDraft = (draft: CalendarEventDraft) => ({
    range: formatEventRange(draft.start, draft.end, draft.allDay, timezone),
    repeat: draft.recurrence ? describeRecurrence(draft.recurrence, timezone) : null,
  });

  const confirmLabel = overlapAcknowledged
    ? CONFIRM_ANYWAY_LABEL[action.action] ?? 'Confirm anyway'
    : isMulti
      ? `Add ${selected.size} event${selected.size === 1 ? '' : 's'}`
      : CONFIRM_LABEL[action.action] ?? 'Confirm';

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
          {display.repeat ? <p className="mt-1 text-sm text-ink-soft">{display.repeat}</p> : null}
          {display.location ? (
            <p className="mt-2 text-sm text-ink-soft">{display.location}</p>
          ) : null}
        </div>
      ) : null}

      {isMulti ? (
        <ul className="mt-4 space-y-2">
          {action.events.map((draft, index) => {
            const { range, repeat } = describeDraft(draft);
            const overlaps = eventConflicts[index] ?? [];
            const isSelected = selected.has(index);
            return (
              <li key={`${draft.start}-${index}`}>
                <label
                  className={`flex cursor-pointer gap-3 rounded-xl border px-3.5 py-3 text-sm ${
                    isSelected ? 'border-black/15' : 'border-black/[0.06] opacity-55'
                  }`}
                >
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 shrink-0 accent-ink"
                    checked={isSelected}
                    disabled={busy}
                    onChange={() => toggle(index)}
                  />
                  <span className="min-w-0">
                    <span className="block font-medium">{draft.title}</span>
                    <span className="block text-ink-soft">
                      {range.date}
                      {range.time ? ` - ${range.time}` : ' - All day'}
                    </span>
                    {repeat ? <span className="block text-ink-soft">{repeat}</span> : null}
                    {draft.location ? (
                      <span className="block text-ink-faint">{draft.location}</span>
                    ) : null}
                    {overlaps.length > 0 ? (
                      <span className="mt-1 block text-xs text-amber-700">
                        Overlaps {overlaps.map((overlap) => overlap.title).join(', ')}
                      </span>
                    ) : null}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      ) : null}

      <p className="mt-4 text-sm text-ink-soft">{action.explanation}</p>

      {action.inferredFields.length > 0 ? (
        <p className="mt-3 text-xs text-ink-faint">
          AI inferred: {action.inferredFields.map((field) => FIELD_LABELS[field] ?? field).join(', ')}
        </p>
      ) : null}

      {selectedOverlaps > 0 ? (
        <div
          className={`mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ${
            overlapAcknowledged ? 'ring-2 ring-amber-400' : ''
          }`}
          role={overlapAcknowledged ? 'alert' : undefined}
        >
          {isMulti ? (
            <p className="font-medium">
              {selectedOverlaps === 1
                ? 'One selected event overlaps something already on your calendar.'
                : `${selectedOverlaps} selected events overlap something already on your calendar.`}
            </p>
          ) : (
            <>
              <p className="font-medium">
                {conflicts.length === 1 ? 'An event already' : `${conflicts.length} events already`}{' '}
                overlap this time:
              </p>
              <ul className="mt-1 list-disc pl-5">
                {conflicts.map((conflict) => (
                  <li key={conflict.id}>
                    {conflict.title} -{' '}
                    {formatEventRange(conflict.start, conflict.end, conflict.allDay, timezone).time}
                  </li>
                ))}
              </ul>
            </>
          )}
          {overlapAcknowledged ? (
            <p className="mt-2 font-medium">
              Press &ldquo;{CONFIRM_ANYWAY_LABEL[action.action] ?? 'Confirm anyway'}&rdquo; to add
              it anyway.
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="mt-6 flex justify-end gap-2">
        <button type="button" className="btn-secondary" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button
          type="button"
          className={action.action === 'DELETE' ? 'btn-danger' : 'btn-primary'}
          onClick={
            needsOverlapAck
              ? () => setOverlapAcknowledged(true)
              : () => onConfirm(isMulti ? [...selected].sort((a, b) => a - b) : undefined)
          }
          disabled={busy || nothingSelected}
        >
          {busy ? 'Working...' : confirmLabel}
        </button>
      </div>
    </div>
  );
}

export { FIELD_LABELS };

'use client';

import { formatEventRange } from '@/lib/util/datetime';
import { describeRecurrence } from '@/lib/util/rrule';
import type { ConfirmResponse } from '@/types';

const HEADLINE: Record<string, string> = {
  CREATE: 'Added to your calendar',
  CREATE_MANY: 'Added to your calendar',
  UPDATE: 'Your calendar is updated',
  DELETE: 'Event deleted',
};

export function ResultCard({
  result,
  timezone,
  onReset,
}: {
  result: ConfirmResponse;
  timezone: string;
  onReset: () => void;
}) {
  const range = result.event
    ? formatEventRange(result.event.start, result.event.end, result.event.allDay, timezone)
    : null;
  const isMulti = result.action === 'CREATE_MANY';

  return (
    <div className="card p-6">
      <span className="chip bg-emerald-50 text-emerald-700">{HEADLINE[result.action] ?? 'Done'}</span>

      {isMulti ? (
        <div className="mt-4">
          <h2 className="text-xl font-semibold tracking-tight">
            {result.events.length} event{result.events.length === 1 ? '' : 's'} added
          </h2>
          <ul className="mt-3 space-y-2 text-sm">
            {result.events.map((event) => {
              const eventRange = formatEventRange(
                event.start,
                event.end,
                event.allDay,
                timezone,
              );
              return (
                <li key={event.id}>
                  <span className="font-medium">{event.title}</span>
                  <span className="ml-2 text-ink-soft">
                    {eventRange.date}
                    {eventRange.time ? ` - ${eventRange.time}` : ''}
                  </span>
                  {event.htmlLink ? (
                    <a
                      className="ml-2 text-ink-faint underline underline-offset-4"
                      href={event.htmlLink}
                      target="_blank"
                      rel="noreferrer noopener"
                    >
                      Open
                    </a>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : result.event ? (
        <div className="mt-4">
          <h2 className="text-xl font-semibold tracking-tight">{result.event.title}</h2>
          {range ? (
            <>
              <p className="mt-2 text-sm text-ink-soft">{range.date}</p>
              <p className="text-sm text-ink-soft">{range.time ?? 'All day'}</p>
            </>
          ) : null}
          {result.event.recurrence ? (
            <p className="mt-1 text-sm text-ink-soft">
              {describeRecurrence(result.event.recurrence, timezone)}
            </p>
          ) : null}
          {result.event.location ? (
            <p className="mt-2 text-sm text-ink-soft">{result.event.location}</p>
          ) : null}
          {result.event.htmlLink ? (
            <a
              className="mt-4 inline-block text-sm text-ink underline underline-offset-4"
              href={result.event.htmlLink}
              target="_blank"
              rel="noreferrer noopener"
            >
              Open in Google Calendar
            </a>
          ) : null}
        </div>
      ) : (
        <p className="mt-4 text-sm text-ink-soft">The event was removed from your calendar.</p>
      )}

      {result.failures.length > 0 ? (
        <div className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <p className="font-medium">
            {result.failures.length} event{result.failures.length === 1 ? ' was' : 's were'} not
            added:
          </p>
          <ul className="mt-1 list-disc pl-5">
            {result.failures.map((failure) => (
              <li key={failure.index}>
                {failure.title} - {failure.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-6 flex justify-end">
        <button type="button" className="btn-secondary" onClick={onReset}>
          Drop something else
        </button>
      </div>
    </div>
  );
}

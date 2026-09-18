'use client';

import { formatEventRange } from '@/lib/util/datetime';
import type { ConfirmResponse } from '@/types';

const HEADLINE: Record<string, string> = {
  CREATE: 'Added to your calendar',
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

  return (
    <div className="card p-6">
      <span className="chip bg-emerald-50 text-emerald-700">{HEADLINE[result.action] ?? 'Done'}</span>

      {result.event ? (
        <div className="mt-4">
          <h2 className="text-xl font-semibold tracking-tight">{result.event.title}</h2>
          {range ? (
            <>
              <p className="mt-2 text-sm text-ink-soft">{range.date}</p>
              <p className="text-sm text-ink-soft">{range.time ?? 'All day'}</p>
            </>
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

      <div className="mt-6 flex justify-end">
        <button type="button" className="btn-secondary" onClick={onReset}>
          Drop something else
        </button>
      </div>
    </div>
  );
}

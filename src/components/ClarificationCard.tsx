'use client';

import { useState } from 'react';
import { FIELD_LABELS } from '@/components/PreviewCard';
import { formatEventRange } from '@/lib/util/datetime';
import type { CalendarAction } from '@/schemas/calendar-action';
import type { CalendarEvent } from '@/types';

interface ClarificationCardProps {
  action: CalendarAction;
  candidates: CalendarEvent[];
  timezone: string;
  busy: boolean;
  onSubmit: (answer: string) => void;
  onCancel: () => void;
}

/**
 * NEED_CLARIFICATION: ask for exactly what is missing and re-run the analysis
 * with the answer attached. The user is never shown a half-filled event they
 * might mistake for something that will be created.
 */
export function ClarificationCard({
  action,
  candidates,
  timezone,
  busy,
  onSubmit,
  onCancel,
}: ClarificationCardProps) {
  const [answer, setAnswer] = useState('');
  const needsTargetEvent = action.missingFields.includes('target_event');

  const choose = (event: CalendarEvent) => {
    const range = formatEventRange(event.start, event.end, event.allDay, timezone);
    setAnswer(`I mean the event "${event.title}" on ${range.date}${range.time ? ` at ${range.time}` : ''} (id ${event.id}).`);
  };

  return (
    <div className="card p-6">
      <span className="chip">Needs a detail</span>
      <p className="mt-4 text-sm text-ink">{action.explanation}</p>

      {action.missingFields.length > 0 ? (
        <p className="mt-2 text-xs text-ink-faint">
          Missing: {action.missingFields.map((field) => FIELD_LABELS[field] ?? field).join(', ')}
        </p>
      ) : null}

      {needsTargetEvent && candidates.length > 0 ? (
        <div className="mt-4">
          <p className="text-xs font-medium text-ink-soft">Did you mean one of these?</p>
          <ul className="mt-2 space-y-2">
            {candidates.slice(0, 6).map((candidate) => {
              const range = formatEventRange(
                candidate.start,
                candidate.end,
                candidate.allDay,
                timezone,
              );
              return (
                <li key={candidate.id}>
                  <button
                    type="button"
                    className="w-full rounded-xl border border-black/10 px-3.5 py-2.5 text-left text-sm hover:bg-black/[0.03]"
                    onClick={() => choose(candidate)}
                    disabled={busy}
                  >
                    <span className="font-medium">{candidate.title}</span>
                    <span className="ml-2 text-ink-faint">
                      {range.date}
                      {range.time ? ` - ${range.time}` : ''}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      <textarea
        className="field mt-4 min-h-[72px] resize-y"
        placeholder="Add the missing detail - e.g. 이번 주 금요일 오후 7시"
        value={answer}
        maxLength={2000}
        disabled={busy}
        onChange={(event) => setAnswer(event.target.value)}
      />

      <div className="mt-5 flex justify-end gap-2">
        <button type="button" className="btn-secondary" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button
          type="button"
          className="btn-primary"
          onClick={() => onSubmit(answer.trim())}
          disabled={busy || answer.trim().length === 0}
        >
          {busy ? 'Understanding your schedule...' : 'Analyze again'}
        </button>
      </div>
    </div>
  );
}

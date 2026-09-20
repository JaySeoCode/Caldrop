import { NextResponse, type NextRequest } from 'next/server';
import { requireSession } from '@/lib/auth/session';
import { calendarContextFor } from '@/lib/calendar/context';
import {
  createEvent,
  deleteEvent,
  getEvent,
  updateEvent,
} from '@/lib/calendar/google-calendar';
import { markActionFailed, markActionSucceeded, recordAction } from '@/lib/db/actions';
import { getOwnedRequest, setRequestStatus } from '@/lib/db/requests';
import { serverEnv } from '@/lib/util/env';
import { AppError, toErrorPayload } from '@/lib/util/errors';
import { consume, RATE_LIMITS } from '@/lib/util/rate-limit';
import type { EventWritePayload } from '@/lib/calendar/types';
import type { CalendarEventDraft } from '@/schemas/calendar-action';
import type { ConfirmResponse, ConfirmFailure } from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The only route in CalDrop that writes to Google Calendar.
 *
 * It takes a request id, never an event payload: what gets written is exactly
 * the proposal that was stored when the preview was produced. A client cannot
 * smuggle in different times, a different title, or a different event id after
 * the user has seen the preview.
 *
 * Authorisation layers, in order:
 *   1. session required;
 *   2. the request row must belong to this user (scoped query);
 *   3. it must still be in `previewed` state (single-use);
 *   4. for UPDATE/DELETE, the target id must be one of the candidates that were
 *      retrieved from *this user's* calendar during the analysis;
 *   5. the event is re-fetched from Google, which enforces real access control.
 *
 * A CREATE_MANY proposal writes several events. The client may send a subset of
 * indexes - which events the user ticked - but never the events themselves, and
 * each (request, index) pair can only be written once.
 */

function toWritePayload(draft: CalendarEventDraft, timeZone: string): EventWritePayload {
  return {
    title: draft.title,
    start: draft.start,
    end: draft.end,
    allDay: draft.allDay,
    location: draft.location,
    description: draft.description,
    timeZone,
    recurrence: draft.recurrence,
  };
}

/** The ticked events, defaulting to all of them. Indexes are positions in `events`. */
function parseSelection(raw: unknown, total: number): number[] {
  if (raw === undefined || raw === null) return [...Array(total).keys()];
  if (!Array.isArray(raw)) {
    throw new AppError('INVALID_INPUT', 'eventIndexes must be an array of numbers.');
  }
  const selected = [
    ...new Set(
      raw.map((value) => {
        if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value >= total) {
          throw new AppError('INVALID_INPUT', 'eventIndexes contains an unknown event.');
        }
        return value;
      }),
    ),
  ].sort((a, b) => a - b);

  if (selected.length === 0) {
    throw new AppError('INVALID_INPUT', 'Select at least one event to add.');
  }
  return selected;
}
export async function POST(request: NextRequest) {
  try {
    const session = await requireSession();
    consume(`confirm:${session.id}`, RATE_LIMITS.confirm);

    const body = (await request.json()) as {
      requestId?: unknown;
      decision?: unknown;
      eventIndexes?: unknown;
    };
    const requestId = body.requestId;
    if (typeof requestId !== 'string' || !UUID_RE.test(requestId)) {
      throw new AppError('INVALID_INPUT', 'A valid requestId is required.');
    }
    const decision = body.decision === 'discard' ? 'discard' : 'confirm';

    const record = await getOwnedRequest(requestId, session.id);
    if (!record) {
      // Another user's request id is reported exactly like a nonexistent one.
      throw new AppError('NOT_FOUND', 'That request could not be found.');
    }

    if (decision === 'discard') {
      await setRequestStatus(requestId, 'discarded');
      return NextResponse.json({ requestId, discarded: true });
    }

    if (record.status === 'confirmed') {
      throw new AppError('CONFLICT', 'This proposal has already been applied.');
    }
    if (record.status !== 'previewed' || !record.aiResult) {
      throw new AppError('CONFLICT', 'This proposal is no longer valid. Please analyse again.');
    }

    const proposal = record.aiResult;
    if (
      proposal.action === 'NO_ACTION' ||
      proposal.action === 'NEED_CLARIFICATION'
    ) {
      throw new AppError('INVALID_INPUT', 'There is nothing to apply for this request.');
    }
    if (proposal.action === 'DELETE' && !serverEnv.enableDelete) {
      throw new AppError('FEATURE_DISABLED', 'Deleting events is disabled in this deployment.');
    }

    const ctx = await calendarContextFor(session.id, session.timezone);

    if (proposal.action === 'CREATE_MANY') {
      const selection = parseSelection(body.eventIndexes, proposal.events.length);
      const created: ConfirmResponse['events'] = [];
      const failures: ConfirmFailure[] = [];

      for (const index of selection) {
        const draft = proposal.events[index];
        if (!draft) continue;
        try {
          const actionId = await recordAction({
            requestId,
            userId: session.id,
            action: 'CREATE',
            payload: draft,
            eventIndex: index,
          });
          try {
            const event = await createEvent(ctx, toWritePayload(draft, session.timezone));
            await markActionSucceeded(actionId, event.id);
            created.push(event);
          } catch (error) {
            const message = error instanceof Error ? error.message : 'unknown error';
            await markActionFailed(actionId, message).catch(() => undefined);
            throw error;
          }
        } catch (error) {
          // One bad event must not discard the ones that did get written.
          failures.push({
            index,
            title: draft.title,
            message:
              error instanceof AppError
                ? error.message
                : 'Google Calendar refused this event.',
          });
        }
      }

      if (created.length === 0) {
        throw new AppError('CALENDAR_FAILED', 'None of the events could be added.');
      }
      await setRequestStatus(requestId, 'confirmed');
      return NextResponse.json({
        requestId,
        action: 'CREATE_MANY',
        event: null,
        events: created,
        deletedEventId: null,
        failures,
      } satisfies ConfirmResponse);
    }

    // Ownership / access verification for mutations of existing events.
    if (proposal.action === 'UPDATE' || proposal.action === 'DELETE') {
      const targetId = proposal.targetEventId;
      if (!targetId) {
        throw new AppError('INVALID_INPUT', 'The proposal has no target event.');
      }
      if (!record.candidateEventIds.includes(targetId)) {
        throw new AppError(
          'FORBIDDEN',
          'The target event was not part of this analysis. Please analyse again.',
        );
      }
      // Re-read through Google so access control is enforced by the source of
      // truth, and so a since-deleted event fails loudly instead of silently.
      const existing = await getEvent(ctx, targetId);
      if (!existing.canEdit) {
        throw new AppError('FORBIDDEN', 'You do not have permission to change that event.');
      }
    }

    const actionId = await recordAction({
      requestId,
      userId: session.id,
      action: proposal.action,
      payload: proposal,
    });

    try {
      let response: ConfirmResponse;

      if (proposal.action === 'DELETE') {
        const targetId = proposal.targetEventId as string;
        await deleteEvent(ctx, targetId);
        response = {
          requestId,
          action: 'DELETE',
          event: null,
          events: [],
          deletedEventId: targetId,
          failures: [],
        };
      } else {
        const draft = proposal.event;
        if (!draft) throw new AppError('INVALID_INPUT', 'The proposal has no event payload.');

        const payload = toWritePayload(draft, session.timezone);
        const event =
          proposal.action === 'CREATE'
            ? await createEvent(ctx, payload)
            : await updateEvent(ctx, proposal.targetEventId as string, payload);

        response = {
          requestId,
          action: proposal.action,
          event,
          events: [event],
          deletedEventId: null,
          failures: [],
        };
      }

      await markActionSucceeded(actionId, response.event?.id ?? response.deletedEventId);
      await setRequestStatus(requestId, 'confirmed');
      return NextResponse.json(response);
    } catch (error) {
      await markActionFailed(
        actionId,
        error instanceof Error ? error.message : 'unknown error',
      ).catch(() => undefined);
      throw error;
    }
  } catch (error) {
    const { status, body } = toErrorPayload(error);
    return NextResponse.json(body, { status });
  }
}

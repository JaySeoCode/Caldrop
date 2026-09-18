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
import type { ConfirmResponse } from '@/types';

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
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireSession();
    consume(`confirm:${session.id}`, RATE_LIMITS.confirm);

    const body = (await request.json()) as { requestId?: unknown; decision?: unknown };
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
        response = { requestId, action: 'DELETE', event: null, deletedEventId: targetId };
      } else {
        const draft = proposal.event;
        if (!draft) throw new AppError('INVALID_INPUT', 'The proposal has no event payload.');

        const payload: EventWritePayload = {
          title: draft.title,
          start: draft.start,
          end: draft.end,
          allDay: draft.allDay,
          location: draft.location,
          description: draft.description,
          timeZone: session.timezone,
        };

        const event =
          proposal.action === 'CREATE'
            ? await createEvent(ctx, payload)
            : await updateEvent(ctx, proposal.targetEventId as string, payload);

        response = { requestId, action: proposal.action, event, deletedEventId: null };
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

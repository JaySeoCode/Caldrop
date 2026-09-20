import { NextResponse, type NextRequest } from 'next/server';
import { requireSession } from '@/lib/auth/session';
import { applyProposal, parseSelection } from '@/lib/calendar/apply';
import { calendarContextFor } from '@/lib/calendar/context';
import { getOwnedRequest, setRequestStatus } from '@/lib/db/requests';
import { AppError, toErrorPayload } from '@/lib/util/errors';
import { consume, RATE_LIMITS } from '@/lib/util/rate-limit';
import type { ConfirmResponse } from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The route that writes to Google Calendar on the user's own press.
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
 * Layers 4 and 5, and the per-event audit rows, live in `applyProposal`, which
 * the background (notification) path uses as well.
 */
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
    const ctx = await calendarContextFor(session.id, session.timezone);
    const result = await applyProposal({
      ctx,
      userId: session.id,
      requestId,
      proposal,
      candidateEventIds: record.candidateEventIds,
      timeZone: session.timezone,
      selection:
        proposal.action === 'CREATE_MANY'
          ? parseSelection(body.eventIndexes, proposal.events.length)
          : undefined,
    });

    return NextResponse.json({
      requestId,
      action: proposal.action,
      event: proposal.action === 'CREATE_MANY' ? null : result.events[0] ?? null,
      events: result.events,
      deletedEventId: result.deletedEventId,
      failures: result.failures,
    } satisfies ConfirmResponse);
  } catch (error) {
    const { status, body } = toErrorPayload(error);
    return NextResponse.json(body, { status });
  }
}

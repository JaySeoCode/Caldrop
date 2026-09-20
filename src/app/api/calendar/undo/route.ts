import { NextResponse, type NextRequest } from 'next/server';
import { requireSession } from '@/lib/auth/session';
import { calendarContextFor } from '@/lib/calendar/context';
import { deleteEvent } from '@/lib/calendar/google-calendar';
import { listUndoableWrites, markActionUndone } from '@/lib/db/actions';
import { getOwnedRequest, setRequestStatus } from '@/lib/db/requests';
import { AppError, toErrorPayload } from '@/lib/util/errors';
import { consume, RATE_LIMITS } from '@/lib/util/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Takes back events CalDrop added on its own, from the notification.
 *
 * This is deliberately not gated behind ENABLE_DELETE: that flag governs
 * deletions the *model* proposes for events the user already had. Here CalDrop
 * only removes events it created itself, for this one request, for this one
 * user - which is the counterweight to writing without a preview.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireSession();
    consume(`undo:${session.id}`, RATE_LIMITS.confirm);

    const body = (await request.json()) as { requestId?: unknown };
    const requestId = body.requestId;
    if (typeof requestId !== 'string' || !UUID_RE.test(requestId)) {
      throw new AppError('INVALID_INPUT', 'A valid requestId is required.');
    }

    const record = await getOwnedRequest(requestId, session.id);
    if (!record) {
      throw new AppError('NOT_FOUND', 'That request could not be found.');
    }

    const writes = await listUndoableWrites(requestId, session.id);
    if (writes.length === 0) {
      return NextResponse.json({ requestId, undone: 0, alreadyUndone: true });
    }

    const ctx = await calendarContextFor(session.id, session.timezone);
    let undone = 0;
    const failures: string[] = [];

    for (const write of writes) {
      try {
        await deleteEvent(ctx, write.googleEventId);
        await markActionUndone(write.id);
        undone += 1;
      } catch (error) {
        // Already gone counts as undone: the user's calendar is in the state
        // they asked for either way.
        if (error instanceof AppError && error.code === 'NOT_FOUND') {
          await markActionUndone(write.id);
          undone += 1;
          continue;
        }
        failures.push(error instanceof Error ? error.message : 'unknown error');
      }
    }

    if (undone > 0) await setRequestStatus(requestId, 'discarded');
    if (undone === 0) {
      throw new AppError('CALENDAR_FAILED', 'Nothing could be removed. Try Google Calendar.', {
        cause: failures[0],
      });
    }

    return NextResponse.json({ requestId, undone, failed: failures.length });
  } catch (error) {
    const { status, body } = toErrorPayload(error);
    return NextResponse.json(body, { status });
  }
}

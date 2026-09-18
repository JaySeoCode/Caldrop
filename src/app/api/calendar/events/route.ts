import { NextResponse, type NextRequest } from 'next/server';
import { requireSession } from '@/lib/auth/session';
import { calendarContextFor } from '@/lib/calendar/context';
import { listEvents } from '@/lib/calendar/google-calendar';
import { addDays } from '@/lib/util/datetime';
import { AppError, toErrorPayload } from '@/lib/util/errors';
import { consume, RATE_LIMITS } from '@/lib/util/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_RANGE_DAYS = 31;

/**
 * Read-only listing of the signed-in user's own primary calendar.
 * There is no way to address another user's calendar from here: the access
 * token is derived from the session, never from a parameter.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await requireSession();
    consume(`events:${session.id}`, RATE_LIMITS.read);

    const params = request.nextUrl.searchParams;
    const now = new Date();
    const timeMin = params.get('timeMin') ? new Date(params.get('timeMin') as string) : now;
    const timeMax = params.get('timeMax')
      ? new Date(params.get('timeMax') as string)
      : addDays(timeMin, 7);

    if (Number.isNaN(timeMin.getTime()) || Number.isNaN(timeMax.getTime())) {
      throw new AppError('INVALID_INPUT', 'timeMin and timeMax must be ISO-8601 date-times.');
    }
    if (timeMax <= timeMin) {
      throw new AppError('INVALID_INPUT', 'timeMax must be after timeMin.');
    }
    if (timeMax.getTime() - timeMin.getTime() > MAX_RANGE_DAYS * 86_400_000) {
      throw new AppError('INVALID_INPUT', `Range must be ${MAX_RANGE_DAYS} days or fewer.`);
    }

    const ctx = await calendarContextFor(session.id, session.timezone);
    const events = await listEvents(ctx, {
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      maxResults: 100,
    });

    return NextResponse.json({ events, timezone: session.timezone });
  } catch (error) {
    const { status, body } = toErrorPayload(error);
    return NextResponse.json(body, { status });
  }
}

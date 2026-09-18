import { NextResponse, type NextRequest } from 'next/server';
import { createSessionToken, getSession, requireSession, setSessionCookie } from '@/lib/auth/session';
import { updateUserTimezone } from '@/lib/db/users';
import { isValidTimeZone } from '@/lib/util/datetime';
import { toErrorPayload } from '@/lib/util/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Current session, or `{ user: null }`. Never exposes any Google token. */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ user: null });
  return NextResponse.json({
    user: {
      id: session.id,
      email: session.email,
      name: session.name,
      picture: session.picture,
      timezone: session.timezone,
      calendarConnected: session.calendarConnected,
    },
  });
}

/** Updates the stored timezone (the browser reports its IANA zone after load). */
export async function PATCH(request: NextRequest) {
  try {
    const session = await requireSession();
    const body = (await request.json()) as { timezone?: unknown };

    if (typeof body.timezone !== 'string' || !isValidTimeZone(body.timezone)) {
      return NextResponse.json(
        { error: { code: 'INVALID_INPUT', message: 'A valid IANA timezone is required.' } },
        { status: 400 },
      );
    }
    if (body.timezone === session.timezone) {
      return NextResponse.json({ timezone: session.timezone });
    }

    await updateUserTimezone(session.id, body.timezone);
    setSessionCookie(
      await createSessionToken({ ...session, timezone: body.timezone }),
    );
    return NextResponse.json({ timezone: body.timezone });
  } catch (error) {
    const { status, body } = toErrorPayload(error);
    return NextResponse.json(body, { status });
  }
}

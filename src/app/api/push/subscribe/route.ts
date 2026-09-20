import { NextResponse, type NextRequest } from 'next/server';
import { requireSession } from '@/lib/auth/session';
import { deleteSubscription, saveSubscription } from '@/lib/db/push';
import { serverEnv } from '@/lib/util/env';
import { AppError, toErrorPayload } from '@/lib/util/errors';
import { consume, RATE_LIMITS } from '@/lib/util/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Push endpoints are URLs from the browser vendor's own service, nothing else. */
const ALLOWED_ENDPOINT = /^https:\/\//;

/**
 * Registers this browser for result notifications, or removes it.
 *
 * The subscription is bound to the signed-in user, so a shared device that
 * switches accounts stops notifying the previous one (the endpoint is the
 * primary key and simply moves).
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireSession();
    consume(`push:${session.id}`, RATE_LIMITS.confirm);

    if (!serverEnv.pushEnabled) {
      throw new AppError('FEATURE_DISABLED', 'Notifications are not configured on this server.');
    }

    const body = (await request.json()) as {
      endpoint?: unknown;
      keys?: { p256dh?: unknown; auth?: unknown };
    };
    const { endpoint } = body;
    const p256dh = body.keys?.p256dh;
    const auth = body.keys?.auth;

    if (
      typeof endpoint !== 'string' ||
      !ALLOWED_ENDPOINT.test(endpoint) ||
      endpoint.length > 2000 ||
      typeof p256dh !== 'string' ||
      typeof auth !== 'string'
    ) {
      throw new AppError('INVALID_INPUT', 'That is not a usable push subscription.');
    }

    await saveSubscription(session.id, { endpoint, p256dh, auth });
    return NextResponse.json({ subscribed: true });
  } catch (error) {
    const { status, body } = toErrorPayload(error);
    return NextResponse.json(body, { status });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await requireSession();
    const body = (await request.json().catch(() => ({}))) as { endpoint?: unknown };
    if (typeof body.endpoint !== 'string') {
      throw new AppError('INVALID_INPUT', 'An endpoint is required.');
    }
    await deleteSubscription(body.endpoint, session.id);
    return NextResponse.json({ subscribed: false });
  } catch (error) {
    const { status, body } = toErrorPayload(error);
    return NextResponse.json(body, { status });
  }
}

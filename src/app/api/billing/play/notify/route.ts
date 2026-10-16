import { NextResponse, type NextRequest } from 'next/server';
import { fetchSubscription } from '@/lib/billing/google-play';
import { updateSubscription } from '@/lib/db/subscriptions';
import { safeEqual } from '@/lib/util/crypto';
import { serverEnv } from '@/lib/util/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface PubSubPush {
  message?: { data?: string };
}

interface DeveloperNotification {
  packageName?: string;
  subscriptionNotification?: { purchaseToken?: string };
}

/**
 * Google Play real-time developer notifications (Pub/Sub push subscription).
 *
 * Point the push subscription at
 *   https://<domain>/api/billing/play/notify?secret=<GOOGLE_PLAY_RTDN_SECRET>
 *
 * The notification body is only a hint that something changed: the new state
 * is always re-read from the Play API, so a forged message can at most cause
 * an extra lookup of a token we already hold. Renewals also work without this
 * route (stale rows are re-read on demand); it is what makes cancellations,
 * refunds and holds take effect promptly.
 */
export async function POST(request: NextRequest) {
  const secret = serverEnv.play.notificationSecret;
  const given = request.nextUrl.searchParams.get('secret') ?? '';
  if (!secret || !safeEqual(given, secret)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  try {
    const push = (await request.json()) as PubSubPush;
    const data = push.message?.data;
    if (!data) return NextResponse.json({ ok: true });

    const notification = JSON.parse(Buffer.from(data, 'base64').toString('utf8')) as DeveloperNotification;
    const token = notification.subscriptionNotification?.purchaseToken;
    if (!token || notification.packageName !== serverEnv.play.packageName) {
      // Test notifications and one-time products: acknowledge and move on.
      return NextResponse.json({ ok: true });
    }

    // Unknown tokens are skipped: a purchase is only linked to an account by
    // the signed-in verify route, never from a notification.
    await updateSubscription(await fetchSubscription(token));
    return NextResponse.json({ ok: true });
  } catch (error) {
    // A non-2xx makes Pub/Sub retry with backoff, which is what we want for a
    // transient Play or database failure.
    console.error('[caldrop] play notification failed', error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

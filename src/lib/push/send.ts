import 'server-only';
import webpush from 'web-push';
import { deleteSubscription, listSubscriptions } from '@/lib/db/push';
import { serverEnv } from '@/lib/util/env';
import type { NotificationPayload } from '@/lib/push/message';

let configured = false;

function configure(): boolean {
  if (configured) return true;
  const { publicKey, privateKey, subject } = serverEnv.vapid;
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
  return true;
}

/**
 * Sends one notification to every browser this user has subscribed.
 *
 * Never throws: a failed notification must not fail (or retry) the calendar
 * work that already happened. Endpoints the push service reports as gone are
 * deleted, which is how a reinstalled or cleared browser stops accumulating.
 */
export async function sendNotification(
  userId: string,
  payload: NotificationPayload,
): Promise<number> {
  if (!configure()) {
    console.warn('[caldrop] push not configured; skipping notification');
    return 0;
  }

  let subscriptions;
  try {
    subscriptions = await listSubscriptions(userId);
  } catch (error) {
    console.error('[caldrop] could not load push subscriptions', error);
    return 0;
  }

  const body = JSON.stringify(payload);
  let delivered = 0;

  await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          },
          body,
          { TTL: 60 * 60 },
        );
        delivered += 1;
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await deleteSubscription(subscription.endpoint).catch(() => undefined);
          return;
        }
        console.error('[caldrop] push delivery failed', { status });
      }
    }),
  );

  return delivered;
}

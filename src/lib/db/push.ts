import 'server-only';
import { getServiceClient } from '@/lib/db/supabase';
import { AppError } from '@/lib/util/errors';

/** A browser push endpoint plus the keys needed to encrypt a payload for it. */
export interface PushSubscriptionRecord {
  endpoint: string;
  p256dh: string;
  auth: string;
}

interface SubscriptionRow {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/**
 * Stores (or refreshes) one browser's subscription for this user.
 *
 * The endpoint is the identity: a browser that re-subscribes gets the same row
 * updated rather than a duplicate, and a subscription that moves to another
 * account stops notifying the old one.
 */
export async function saveSubscription(
  userId: string,
  subscription: PushSubscriptionRecord,
): Promise<void> {
  const { error } = await getServiceClient()
    .from('push_subscriptions')
    .upsert(
      {
        user_id: userId,
        endpoint: subscription.endpoint,
        p256dh: subscription.p256dh,
        auth: subscription.auth,
      },
      { onConflict: 'endpoint' },
    );

  if (error) {
    throw new AppError('INTERNAL', 'Could not save the notification subscription.', {
      cause: error.message,
    });
  }
}

export async function listSubscriptions(userId: string): Promise<PushSubscriptionRecord[]> {
  const { data, error } = await getServiceClient()
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('user_id', userId)
    .returns<SubscriptionRow[]>();

  if (error) {
    throw new AppError('INTERNAL', 'Could not load notification subscriptions.', {
      cause: error.message,
    });
  }
  return data ?? [];
}

export async function countSubscriptions(userId: string): Promise<number> {
  const { count, error } = await getServiceClient()
    .from('push_subscriptions')
    .select('endpoint', { count: 'exact', head: true })
    .eq('user_id', userId);

  if (error) return 0;
  return count ?? 0;
}

/** Removes one endpoint. Used on unsubscribe and when a push is rejected as gone. */
export async function deleteSubscription(endpoint: string, userId?: string): Promise<void> {
  const query = getServiceClient().from('push_subscriptions').delete().eq('endpoint', endpoint);
  await (userId ? query.eq('user_id', userId) : query);
}

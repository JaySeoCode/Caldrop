import 'server-only';
import { fetchSubscription } from '@/lib/billing/google-play';
import { decidePlan, needsRefresh } from '@/lib/billing/plan';
import { listSubscriptions, updateSubscription, type SubscriptionRecord } from '@/lib/db/subscriptions';
import { getTrialEndsAt } from '@/lib/db/users';
import { serverEnv } from '@/lib/util/env';
import { AppError } from '@/lib/util/errors';
import type { BillingStatus } from '@/types';

/** A stale row is re-read from Play at most this often, however many requests arrive. */
const REFRESH_INTERVAL_MS = 10 * 60 * 1000;

async function refreshStale(rows: SubscriptionRecord[], now: Date): Promise<SubscriptionRecord[]> {
  if (!serverEnv.playBillingConfigured) return rows;
  return Promise.all(
    rows.map(async (row) => {
      if (!needsRefresh(row, now)) return row;
      if (now.getTime() - new Date(row.checkedAt).getTime() < REFRESH_INTERVAL_MS) return row;
      try {
        const fresh = await fetchSubscription(row.purchaseToken);
        await updateSubscription(fresh);
        return { ...row, state: fresh.state, expiresAt: fresh.expiresAt, checkedAt: now.toISOString() };
      } catch (error) {
        // Play being unreachable must not lock a paying user out on its own:
        // the cached row stands and the next request tries again.
        console.error('[caldrop] subscription refresh failed', error);
        return row;
      }
    }),
  );
}

export async function getBillingStatus(userId: string, now = new Date()): Promise<BillingStatus> {
  const [trialEndsAt, rows] = await Promise.all([getTrialEndsAt(userId), listSubscriptions(userId)]);
  const subscriptions = await refreshStale(rows, now);
  const plan = decidePlan({ now, trialEndsAt, subscriptions });
  return {
    ...plan,
    trialEndsAt,
    enforced: serverEnv.billingEnabled,
    productId: serverEnv.playBillingConfigured ? serverEnv.play.subscriptionId : null,
  };
}

/** Throws PAYMENT_REQUIRED once the trial is over and nothing is paid for. */
export async function requireEntitlement(userId: string): Promise<void> {
  if (!serverEnv.billingEnabled) return;
  const billing = await getBillingStatus(userId);
  if (billing.status === 'expired') {
    throw new AppError(
      'PAYMENT_REQUIRED',
      'Your free trial has ended. Subscribe to keep adding things to your calendar.',
    );
  }
}

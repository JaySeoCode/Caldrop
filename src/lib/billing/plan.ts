/**
 * Who may analyse: the pure decision, kept free of I/O so it is testable.
 *
 * Every account gets a free trial from its first sign-in (no card, no store
 * involved), then needs a Google Play subscription. Play is the source of truth
 * for the subscription; we only cache its state and expiry.
 */
import type { PlanStatus } from '@/types';

/** `subscriptionState` from the Play Developer API (purchases.subscriptionsv2). */
export type PlaySubscriptionState =
  | 'SUBSCRIPTION_STATE_PENDING'
  | 'SUBSCRIPTION_STATE_ACTIVE'
  | 'SUBSCRIPTION_STATE_PAUSED'
  | 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD'
  | 'SUBSCRIPTION_STATE_ON_HOLD'
  | 'SUBSCRIPTION_STATE_CANCELED'
  | 'SUBSCRIPTION_STATE_EXPIRED'
  | 'SUBSCRIPTION_STATE_UNSPECIFIED';

export interface CachedSubscription {
  state: PlaySubscriptionState;
  expiresAt: string | null;
}

/**
 * States that grant access until `expiresAt`. CANCELED is included because a
 * cancelled subscription still runs to the end of the period the user paid for.
 * PENDING (payment not cleared), ON_HOLD and PAUSED do not.
 */
const ENTITLED_STATES: ReadonlySet<PlaySubscriptionState> = new Set([
  'SUBSCRIPTION_STATE_ACTIVE',
  'SUBSCRIPTION_STATE_IN_GRACE_PERIOD',
  'SUBSCRIPTION_STATE_CANCELED',
]);

/** States Play may still move forward (a renewal) without the user doing anything. */
const RENEWING_STATES: ReadonlySet<PlaySubscriptionState> = new Set([
  'SUBSCRIPTION_STATE_ACTIVE',
  'SUBSCRIPTION_STATE_IN_GRACE_PERIOD',
]);

export function decidePlan(input: {
  now: Date;
  trialEndsAt: string;
  subscriptions: CachedSubscription[];
}): { status: PlanStatus; activeUntil: string | null } {
  let activeUntil: Date | null = null;
  for (const subscription of input.subscriptions) {
    if (!ENTITLED_STATES.has(subscription.state) || !subscription.expiresAt) continue;
    const expiry = new Date(subscription.expiresAt);
    if (expiry > input.now && (!activeUntil || expiry > activeUntil)) activeUntil = expiry;
  }
  if (activeUntil) return { status: 'active', activeUntil: activeUntil.toISOString() };

  if (new Date(input.trialEndsAt) > input.now) return { status: 'trial', activeUntil: null };
  return { status: 'expired', activeUntil: null };
}

/** Play will charge this subscription again unless it is cancelled. */
export function isRenewing(subscription: CachedSubscription): boolean {
  return RENEWING_STATES.has(subscription.state);
}

/**
 * A cached row whose period ran out while Play still had it renewing is stale,
 * not finished: the renewal most likely went through and we have not heard.
 * Re-reading it from Play is what keeps renewals working even if a real-time
 * notification was missed.
 */
export function needsRefresh(subscription: CachedSubscription, now: Date): boolean {
  if (!isRenewing(subscription)) return false;
  return !subscription.expiresAt || new Date(subscription.expiresAt) <= now;
}

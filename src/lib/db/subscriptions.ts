import 'server-only';
import type { PlaySubscription } from '@/lib/billing/google-play';
import type { CachedSubscription, PlaySubscriptionState } from '@/lib/billing/plan';
import { getServiceClient } from '@/lib/db/supabase';
import { AppError } from '@/lib/util/errors';

export interface SubscriptionRecord extends CachedSubscription {
  purchaseToken: string;
  productId: string;
  checkedAt: string;
}

interface SubscriptionRow {
  purchase_token: string;
  product_id: string;
  state: PlaySubscriptionState;
  expires_at: string | null;
  checked_at: string;
}

const COLUMNS = 'purchase_token, product_id, state, expires_at, checked_at';

function toRecord(row: SubscriptionRow): SubscriptionRecord {
  return {
    purchaseToken: row.purchase_token,
    productId: row.product_id,
    state: row.state,
    expiresAt: row.expires_at,
    checkedAt: row.checked_at,
  };
}

function stateColumns(subscription: PlaySubscription) {
  return {
    product_id: subscription.productId,
    state: subscription.state,
    expires_at: subscription.expiresAt,
    acknowledged: subscription.acknowledged,
    linked_purchase_token: subscription.linkedPurchaseToken,
    test_purchase: subscription.testPurchase,
    checked_at: new Date().toISOString(),
  };
}

export async function listSubscriptions(userId: string): Promise<SubscriptionRecord[]> {
  const { data, error } = await getServiceClient()
    .from('play_subscriptions')
    .select(COLUMNS)
    .eq('user_id', userId)
    .order('expires_at', { ascending: false, nullsFirst: false })
    .returns<SubscriptionRow[]>();
  if (error) {
    throw new AppError('INTERNAL', 'Could not load the subscription.', { cause: error.message });
  }
  return (data ?? []).map(toRecord);
}

/**
 * Ties a verified Play purchase to this account. A purchase token belongs to
 * the first account that claims it: replaying someone else's token (it is not
 * secret to the device that bought it) must not unlock a second account.
 */
export async function claimSubscription(userId: string, subscription: PlaySubscription): Promise<void> {
  const supabase = getServiceClient();

  // Insert-if-absent first, so two simultaneous claims cannot both "win".
  const { error: insertError } = await supabase
    .from('play_subscriptions')
    .upsert(
      { purchase_token: subscription.purchaseToken, user_id: userId, ...stateColumns(subscription) },
      { onConflict: 'purchase_token', ignoreDuplicates: true },
    );
  if (insertError) {
    throw new AppError('INTERNAL', 'Could not save the subscription.', { cause: insertError.message });
  }

  const { data: owner, error: ownerError } = await supabase
    .from('play_subscriptions')
    .select('user_id')
    .eq('purchase_token', subscription.purchaseToken)
    .single<{ user_id: string }>();
  if (ownerError || !owner) {
    throw new AppError('INTERNAL', 'Could not save the subscription.', { cause: ownerError?.message });
  }
  if (owner.user_id !== userId) {
    throw new AppError('CONFLICT', 'This purchase is already linked to another CalDrop account.');
  }

  await updateSubscription(subscription);
}

/** Refreshes the cached state of a known purchase. Returns false if we have never seen it. */
export async function updateSubscription(subscription: PlaySubscription): Promise<boolean> {
  const { data, error } = await getServiceClient()
    .from('play_subscriptions')
    .update(stateColumns(subscription))
    .eq('purchase_token', subscription.purchaseToken)
    .select('purchase_token');
  if (error) {
    throw new AppError('INTERNAL', 'Could not update the subscription.', { cause: error.message });
  }
  return (data ?? []).length > 0;
}

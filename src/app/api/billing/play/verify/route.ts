import { NextResponse, type NextRequest } from 'next/server';
import { requireSession } from '@/lib/auth/session';
import { getBillingStatus } from '@/lib/billing/entitlement';
import { acknowledgeSubscription, fetchSubscription } from '@/lib/billing/google-play';
import { claimSubscription } from '@/lib/db/subscriptions';
import { serverEnv } from '@/lib/util/env';
import { AppError, toErrorPayload } from '@/lib/util/errors';
import { consume, RATE_LIMITS } from '@/lib/util/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Play purchase tokens are opaque, long, URL-safe strings. */
const TOKEN_RE = /^[\w.\-]{20,2000}$/;

/**
 * Links a Google Play purchase to the signed-in account.
 *
 * Called by the Android app right after a purchase, and again to restore one
 * (reinstall, new phone). The token is the only thing taken from the client;
 * what it buys, until when, and whether it is paid is read from Play itself.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireSession();
    consume(`billing-verify:${session.id}`, RATE_LIMITS.billing);

    if (!serverEnv.playBillingConfigured) {
      throw new AppError('FEATURE_DISABLED', 'Google Play billing is not configured.');
    }

    const body = (await request.json().catch(() => ({}))) as { purchaseToken?: unknown };
    const token = body.purchaseToken;
    if (typeof token !== 'string' || !TOKEN_RE.test(token)) {
      throw new AppError('INVALID_INPUT', 'purchaseToken is missing or malformed.');
    }

    const subscription = await fetchSubscription(token);
    if (subscription.productId !== serverEnv.play.subscriptionId) {
      throw new AppError('INVALID_INPUT', 'That purchase is not a CalDrop subscription.');
    }

    await claimSubscription(session.id, subscription);
    // Only after the purchase is safely tied to this account: an unacknowledged
    // purchase is refunded by Play after three days, which is the right outcome
    // if we never managed to record it.
    if (!subscription.acknowledged && subscription.state === 'SUBSCRIPTION_STATE_ACTIVE') {
      await acknowledgeSubscription(subscription.productId, token);
    }

    return NextResponse.json(await getBillingStatus(session.id));
  } catch (error) {
    const { status, body } = toErrorPayload(error);
    return NextResponse.json(body, { status });
  }
}

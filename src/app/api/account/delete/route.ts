import { NextResponse, type NextRequest } from 'next/server';
import { revokeToken } from '@/lib/auth/google-oauth';
import { invalidateAccessToken } from '@/lib/auth/google-tokens';
import { clearSessionCookie, requireSession } from '@/lib/auth/session';
import { cancelSubscription } from '@/lib/billing/google-play';
import { isRenewing } from '@/lib/billing/plan';
import { getRefreshToken } from '@/lib/db/google-accounts';
import { listSubscriptions } from '@/lib/db/subscriptions';
import { deleteUser, getTrialEndsAt, getUserById, rememberDeletedAccount } from '@/lib/db/users';
import { serverEnv } from '@/lib/util/env';
import { AppError, toErrorPayload } from '@/lib/util/errors';
import { consume, RATE_LIMITS } from '@/lib/util/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Deletes the signed-in account and everything stored about it.
 *
 * Order matters: the steps that reach outside (Google OAuth, Google Play) run
 * first and are best-effort, because a provider hiccup must not leave the user
 * unable to delete. The database delete is the one step that has to succeed.
 * Events already on the user's Google Calendar are theirs and are left alone.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireSession();
    consume(`account-delete:${session.id}`, RATE_LIMITS.account);

    const body = (await request.json().catch(() => ({}))) as { confirm?: unknown };
    if (body.confirm !== true) {
      throw new AppError('INVALID_INPUT', 'Deleting an account needs explicit confirmation.');
    }

    const user = await getUserById(session.id);
    if (!user) {
      clearSessionCookie();
      return NextResponse.json({ ok: true });
    }

    // Stop future Play charges for an account that will no longer exist.
    if (serverEnv.playBillingConfigured) {
      for (const subscription of await listSubscriptions(user.id)) {
        if (!isRenewing(subscription)) continue;
        await cancelSubscription(subscription.productId, subscription.purchaseToken).catch(
          (error) => console.error('[caldrop] cancel on delete failed', error),
        );
      }
    }

    // Revoking the refresh token removes CalDrop from the user's Google
    // account permissions entirely, not just from our database.
    const refreshToken = await getRefreshToken(user.id).catch(() => null);
    if (refreshToken) await revokeToken(refreshToken);
    invalidateAccessToken(user.id);

    await rememberDeletedAccount(user.googleSub, await getTrialEndsAt(user.id));
    await deleteUser(user.id);
    clearSessionCookie();

    return NextResponse.json({ ok: true });
  } catch (error) {
    const { status, body } = toErrorPayload(error);
    return NextResponse.json(body, { status });
  }
}

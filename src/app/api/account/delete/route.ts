import { NextResponse, type NextRequest } from 'next/server';
import { revokeToken } from '@/lib/auth/google-oauth';
import { invalidateAccessToken } from '@/lib/auth/google-tokens';
import { clearSessionCookie, requireSession } from '@/lib/auth/session';
import { getRefreshToken } from '@/lib/db/google-accounts';
import { deleteUser, getUserById } from '@/lib/db/users';
import { AppError, toErrorPayload } from '@/lib/util/errors';
import { consume, RATE_LIMITS } from '@/lib/util/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Deletes the signed-in account and everything stored about it.
 *
 * Order matters: revoking Google access reaches outside and runs first as a
 * best effort, because a provider hiccup must not leave the user unable to
 * delete. The database delete is the one step that has to succeed. Events
 * already on the user's Google Calendar are theirs and are left alone.
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

    // Revoking the refresh token removes CalDrop from the user's Google
    // account permissions entirely, not just from our database.
    const refreshToken = await getRefreshToken(user.id).catch(() => null);
    if (refreshToken) await revokeToken(refreshToken);
    invalidateAccessToken(user.id);

    await deleteUser(user.id);
    clearSessionCookie();

    return NextResponse.json({ ok: true });
  } catch (error) {
    const { status, body } = toErrorPayload(error);
    return NextResponse.json(body, { status });
  }
}

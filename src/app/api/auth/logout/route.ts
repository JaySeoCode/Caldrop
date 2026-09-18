import { NextResponse } from 'next/server';
import { clearSessionCookie, getSession } from '@/lib/auth/session';
import { invalidateAccessToken } from '@/lib/auth/google-tokens';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Sign out. POST-only so a stray link or prefetch cannot log the user out.
 * The stored refresh token is deliberately kept: signing out ends the browser
 * session, it does not disconnect the calendar.
 */
export async function POST() {
  const session = await getSession();
  if (session) invalidateAccessToken(session.id);
  clearSessionCookie();
  return NextResponse.json({ ok: true });
}

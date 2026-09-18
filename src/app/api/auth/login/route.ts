import { NextResponse, type NextRequest } from 'next/server';
import { randomBytes } from 'node:crypto';
import { buildAuthorizationUrl } from '@/lib/auth/google-oauth';
import { setOAuthStateCookie } from '@/lib/auth/session';
import { isValidTimeZone } from '@/lib/util/datetime';
import { toErrorPayload } from '@/lib/util/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Starts the Google OAuth flow.
 *
 * The browser's IANA timezone rides along in the state cookie so a first-time
 * user gets the right timezone without an extra round trip. State is a random
 * 256-bit value checked on callback (CSRF protection).
 */
export async function GET(request: NextRequest) {
  try {
    const timezoneParam = request.nextUrl.searchParams.get('tz');
    const timezone = timezoneParam && isValidTimeZone(timezoneParam) ? timezoneParam : null;
    const nonce = randomBytes(32).toString('base64url');
    const state = timezone ? `${nonce}|${timezone}` : nonce;

    setOAuthStateCookie(state);
    return NextResponse.redirect(buildAuthorizationUrl(state));
  } catch (error) {
    const { status, body } = toErrorPayload(error);
    return NextResponse.json(body, { status });
  }
}

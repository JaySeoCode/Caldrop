import { NextResponse, type NextRequest } from 'next/server';
import {
  exchangeCodeForTokens,
  fetchGoogleProfile,
  hasCalendarScope,
} from '@/lib/auth/google-oauth';
import { createSessionToken, readAndClearOAuthState, setSessionCookie } from '@/lib/auth/session';
import { saveRefreshToken } from '@/lib/db/google-accounts';
import { upsertUserFromGoogle } from '@/lib/db/users';
import { safeEqual } from '@/lib/util/crypto';
import { serverEnv } from '@/lib/util/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function failureRedirect(reason: string): NextResponse {
  const url = new URL('/', serverEnv.appUrl);
  url.searchParams.set('auth_error', reason);
  return NextResponse.redirect(url);
}

/**
 * OAuth callback. On success the browser receives exactly one credential: an
 * HttpOnly session cookie. Google's access and refresh tokens never leave the
 * server - the refresh token is encrypted before it reaches the database.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const expectedState = readAndClearOAuthState();

  if (params.get('error')) {
    return failureRedirect('access_denied');
  }

  const code = params.get('code');
  const state = params.get('state');
  if (!code || !state || !expectedState || !safeEqual(state, expectedState)) {
    return failureRedirect('invalid_state');
  }

  try {
    const tokens = await exchangeCodeForTokens(code);

    if (!hasCalendarScope(tokens.scopes)) {
      return failureRedirect('calendar_scope_required');
    }

    const profile = await fetchGoogleProfile(tokens.accessToken);
    if (!profile.emailVerified) {
      return failureRedirect('email_not_verified');
    }

    const [, timezoneFromState] = state.split('|', 2);
    const user = await upsertUserFromGoogle({
      googleSub: profile.sub,
      email: profile.email,
      name: profile.name,
      picture: profile.picture,
      timezone: timezoneFromState ?? null,
    });

    // `prompt=consent` means Google returns a refresh token on every sign-in;
    // if it is ever absent we keep any previously stored one rather than
    // clobbering a working connection.
    if (tokens.refreshToken) {
      await saveRefreshToken(user.id, tokens.refreshToken, tokens.scopes);
    }

    const sessionToken = await createSessionToken({
      id: user.id,
      email: user.email,
      name: user.name,
      picture: user.picture,
      timezone: user.timezone,
      calendarConnected: true,
    });
    setSessionCookie(sessionToken);

    return NextResponse.redirect(new URL('/', serverEnv.appUrl));
  } catch (error) {
    console.error('[caldrop] oauth callback failed', error);
    return failureRedirect('sign_in_failed');
  }
}

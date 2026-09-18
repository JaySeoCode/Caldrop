import 'server-only';
import { OAUTH_REDIRECT_PATH, serverEnv } from '@/lib/util/env';
import { AppError } from '@/lib/util/errors';

export const GOOGLE_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.readonly',
] as const;

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const USERINFO_ENDPOINT = 'https://openidconnect.googleapis.com/v1/userinfo';
const REVOKE_ENDPOINT = 'https://oauth2.googleapis.com/revoke';

export function redirectUri(): string {
  return `${serverEnv.appUrl}${OAUTH_REDIRECT_PATH}`;
}

export function buildAuthorizationUrl(state: string, loginHint?: string): string {
  const params = new URLSearchParams({
    client_id: serverEnv.googleClientId,
    redirect_uri: redirectUri(),
    response_type: 'code',
    scope: GOOGLE_SCOPES.join(' '),
    // offline + consent guarantee a refresh token even on repeat sign-ins.
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  });
  if (loginHint) params.set('login_hint', loginHint);
  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

export interface TokenResponse {
  accessToken: string;
  refreshToken: string | null;
  expiresInSeconds: number;
  scopes: string[];
  idToken: string | null;
}

interface RawTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  id_token?: string;
  error?: string;
  error_description?: string;
}

async function postToken(body: URLSearchParams): Promise<TokenResponse> {
  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    cache: 'no-store',
  });
  const payload = (await response.json()) as RawTokenResponse;

  if (!response.ok || !payload.access_token) {
    const reason = payload.error_description ?? payload.error ?? `HTTP ${response.status}`;
    // invalid_grant = the refresh token was revoked or expired: re-consent needed.
    if (payload.error === 'invalid_grant') {
      throw new AppError(
        'CALENDAR_NOT_CONNECTED',
        'Google access has expired. Please reconnect your calendar.',
      );
    }
    throw new AppError('CALENDAR_FAILED', `Google token request failed: ${reason}`);
  }

  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token ?? null,
    expiresInSeconds: payload.expires_in ?? 3600,
    scopes: payload.scope ? payload.scope.split(' ') : [],
    idToken: payload.id_token ?? null,
  };
}

export function exchangeCodeForTokens(code: string): Promise<TokenResponse> {
  return postToken(
    new URLSearchParams({
      code,
      client_id: serverEnv.googleClientId,
      client_secret: serverEnv.googleClientSecret,
      redirect_uri: redirectUri(),
      grant_type: 'authorization_code',
    }),
  );
}

export function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  return postToken(
    new URLSearchParams({
      refresh_token: refreshToken,
      client_id: serverEnv.googleClientId,
      client_secret: serverEnv.googleClientSecret,
      grant_type: 'refresh_token',
    }),
  );
}

export interface GoogleProfile {
  sub: string;
  email: string;
  name: string | null;
  picture: string | null;
  emailVerified: boolean;
}

export async function fetchGoogleProfile(accessToken: string): Promise<GoogleProfile> {
  const response = await fetch(USERINFO_ENDPOINT, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  if (!response.ok) {
    throw new AppError('CALENDAR_FAILED', 'Could not read your Google profile.');
  }
  const payload = (await response.json()) as {
    sub: string;
    email?: string;
    name?: string;
    picture?: string;
    email_verified?: boolean;
  };
  if (!payload.email) {
    throw new AppError('FORBIDDEN', 'A Google account with an email address is required.');
  }
  return {
    sub: payload.sub,
    email: payload.email,
    name: payload.name ?? null,
    picture: payload.picture ?? null,
    emailVerified: payload.email_verified ?? false,
  };
}

export async function revokeToken(token: string): Promise<void> {
  await fetch(REVOKE_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ token }),
    cache: 'no-store',
  }).catch(() => undefined);
}

export function hasCalendarScope(scopes: string[]): boolean {
  return scopes.some((scope) => scope.includes('auth/calendar'));
}

import 'server-only';
import { getRefreshToken } from '@/lib/db/google-accounts';
import { refreshAccessToken } from '@/lib/auth/google-oauth';
import { AppError } from '@/lib/util/errors';

interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

/**
 * Short-lived in-process cache of access tokens.
 *
 * Access tokens live ~1h; caching them avoids a token round-trip on every
 * calendar call within a warm serverless instance. Refresh tokens themselves
 * never leave the database layer unencrypted for longer than one call, and
 * neither token is ever sent to the browser.
 */
const cache = new Map<string, CachedToken>();
const EXPIRY_SKEW_MS = 60_000;

export async function getAccessTokenForUser(userId: string): Promise<string> {
  const cached = cache.get(userId);
  if (cached && cached.expiresAt - EXPIRY_SKEW_MS > Date.now()) {
    return cached.accessToken;
  }

  const refreshToken = await getRefreshToken(userId);
  if (!refreshToken) {
    throw new AppError(
      'CALENDAR_NOT_CONNECTED',
      'Google Calendar is not connected for this account.',
    );
  }

  const tokens = await refreshAccessToken(refreshToken);
  cache.set(userId, {
    accessToken: tokens.accessToken,
    expiresAt: Date.now() + tokens.expiresInSeconds * 1000,
  });
  return tokens.accessToken;
}

export function invalidateAccessToken(userId: string): void {
  cache.delete(userId);
}

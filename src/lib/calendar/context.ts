import 'server-only';
import { getAccessTokenForUser } from '@/lib/auth/google-tokens';
import type { CalendarContext } from '@/lib/calendar/google-calendar';

/**
 * Builds the per-request calendar context. Keeping token acquisition in one
 * place means every calendar call is necessarily made on behalf of exactly one
 * authenticated user - there is no code path that talks to Google without one.
 */
export async function calendarContextFor(
  userId: string,
  timeZone: string,
): Promise<CalendarContext> {
  const accessToken = await getAccessTokenForUser(userId);
  return { userId, accessToken, timeZone };
}

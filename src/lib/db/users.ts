import 'server-only';
import { getServiceClient } from '@/lib/db/supabase';
import { AppError } from '@/lib/util/errors';
import { isValidTimeZone } from '@/lib/util/datetime';
import { serverEnv } from '@/lib/util/env';
import type { UserRecord } from '@/types';

interface UserRow {
  id: string;
  google_sub: string;
  email: string;
  name: string | null;
  picture: string | null;
  timezone: string;
  created_at: string;
}

function toUser(row: UserRow): UserRecord {
  return {
    id: row.id,
    googleSub: row.google_sub,
    email: row.email,
    name: row.name,
    picture: row.picture,
    timezone: row.timezone,
    createdAt: row.created_at,
  };
}

export async function upsertUserFromGoogle(profile: {
  googleSub: string;
  email: string;
  name: string | null;
  picture: string | null;
  timezone?: string | null;
}): Promise<UserRecord> {
  const supabase = getServiceClient();
  const timezone =
    profile.timezone && isValidTimeZone(profile.timezone)
      ? profile.timezone
      : serverEnv.defaultTimezone;

  const { data, error } = await supabase
    .from('users')
    .upsert(
      {
        google_sub: profile.googleSub,
        email: profile.email,
        name: profile.name,
        picture: profile.picture,
        timezone,
      },
      { onConflict: 'google_sub' },
    )
    .select('id, google_sub, email, name, picture, timezone, created_at')
    .single<UserRow>();

  if (error || !data) {
    throw new AppError('INTERNAL', 'Could not persist the signed-in user.', {
      cause: error?.message,
    });
  }
  return toUser(data);
}

export async function getUserById(userId: string): Promise<UserRecord | null> {
  const { data, error } = await getServiceClient()
    .from('users')
    .select('id, google_sub, email, name, picture, timezone, created_at')
    .eq('id', userId)
    .maybeSingle<UserRow>();

  if (error) {
    throw new AppError('INTERNAL', 'Could not load the user.', { cause: error.message });
  }
  return data ? toUser(data) : null;
}

export async function updateUserTimezone(userId: string, timezone: string): Promise<void> {
  if (!isValidTimeZone(timezone)) {
    throw new AppError('INVALID_INPUT', `Unknown timezone: ${timezone}`);
  }
  const { error } = await getServiceClient()
    .from('users')
    .update({ timezone })
    .eq('id', userId);
  if (error) {
    throw new AppError('INTERNAL', 'Could not update the timezone.', { cause: error.message });
  }
}

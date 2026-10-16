import 'server-only';
import { createHmac } from 'node:crypto';
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

/** End of this account's free trial, set by the database when the user first signs in. */
export async function getTrialEndsAt(userId: string): Promise<string> {
  const { data, error } = await getServiceClient()
    .from('users')
    .select('trial_ends_at')
    .eq('id', userId)
    .single<{ trial_ends_at: string }>();
  if (error || !data) {
    throw new AppError('INTERNAL', 'Could not load the plan.', { cause: error?.message });
  }
  return data.trial_ends_at;
}

/**
 * A deleted account leaves behind one row: a keyed hash of its Google id and
 * when its trial ended. Signing up again with the same Google account then
 * resumes that trial instead of starting a fresh one. Nothing else survives,
 * and the row itself is dropped after a year.
 */
const DELETED_ACCOUNT_RETENTION_MS = 365 * 86_400_000;

function googleSubHash(googleSub: string): string {
  return createHmac('sha256', serverEnv.tokenEncryptionKey)
    .update(`deleted-account:${googleSub}`)
    .digest('hex');
}

export async function rememberDeletedAccount(googleSub: string, trialEndsAt: string): Promise<void> {
  const supabase = getServiceClient();
  const { error } = await supabase
    .from('deleted_accounts')
    .upsert(
      { google_sub_hash: googleSubHash(googleSub), trial_ends_at: trialEndsAt, deleted_at: new Date().toISOString() },
      { onConflict: 'google_sub_hash' },
    );
  if (error) {
    throw new AppError('INTERNAL', 'Could not delete the account.', { cause: error.message });
  }
  // Opportunistic purge: the retention promise is kept without a cron job.
  await supabase
    .from('deleted_accounts')
    .delete()
    .lt('deleted_at', new Date(Date.now() - DELETED_ACCOUNT_RETENTION_MS).toISOString());
}

/** Called on every sign-in: never lets re-registering extend a trial. Idempotent. */
export async function applyEarlierTrial(userId: string, googleSub: string): Promise<void> {
  const supabase = getServiceClient();
  const { data } = await supabase
    .from('deleted_accounts')
    .select('trial_ends_at')
    .eq('google_sub_hash', googleSubHash(googleSub))
    .gt('deleted_at', new Date(Date.now() - DELETED_ACCOUNT_RETENTION_MS).toISOString())
    .maybeSingle<{ trial_ends_at: string }>();
  if (!data) return;
  await supabase
    .from('users')
    .update({ trial_ends_at: data.trial_ends_at })
    .eq('id', userId)
    .gt('trial_ends_at', data.trial_ends_at);
}

/**
 * Removes the user row; every table holding their data references it with
 * `on delete cascade`, so requests, actions, Google credentials, push and Play
 * subscriptions go in the same statement.
 */
export async function deleteUser(userId: string): Promise<void> {
  const { error } = await getServiceClient().from('users').delete().eq('id', userId);
  if (error) {
    throw new AppError('INTERNAL', 'Could not delete the account.', { cause: error.message });
  }
}

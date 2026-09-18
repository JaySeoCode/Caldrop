import 'server-only';
import { getServiceClient } from '@/lib/db/supabase';
import { decryptSecret, encryptSecret } from '@/lib/util/crypto';
import { serverEnv } from '@/lib/util/env';
import { AppError } from '@/lib/util/errors';

/**
 * Refresh tokens are encrypted with AES-256-GCM before insert and decrypted
 * only inside this module, so no other layer ever holds the ciphertext format
 * or the plaintext longer than one call.
 */
export async function saveRefreshToken(
  userId: string,
  refreshToken: string,
  scopes: string[],
): Promise<void> {
  const encrypted = encryptSecret(refreshToken, serverEnv.tokenEncryptionKey);
  const { error } = await getServiceClient()
    .from('google_accounts')
    .upsert(
      { user_id: userId, encrypted_refresh_token: encrypted, scopes },
      { onConflict: 'user_id' },
    );
  if (error) {
    throw new AppError('INTERNAL', 'Could not store Google credentials.', {
      cause: error.message,
    });
  }
}

export async function getRefreshToken(userId: string): Promise<string | null> {
  const { data, error } = await getServiceClient()
    .from('google_accounts')
    .select('encrypted_refresh_token')
    .eq('user_id', userId)
    .maybeSingle<{ encrypted_refresh_token: string }>();

  if (error) {
    throw new AppError('INTERNAL', 'Could not read Google credentials.', { cause: error.message });
  }
  if (!data) return null;

  try {
    return decryptSecret(data.encrypted_refresh_token, serverEnv.tokenEncryptionKey);
  } catch {
    // A key rotation or corrupted row: force a re-consent rather than failing opaquely.
    throw new AppError(
      'CALENDAR_NOT_CONNECTED',
      'Your Google connection needs to be renewed. Please sign in again.',
    );
  }
}

export async function deleteGoogleAccount(userId: string): Promise<void> {
  await getServiceClient().from('google_accounts').delete().eq('user_id', userId);
}

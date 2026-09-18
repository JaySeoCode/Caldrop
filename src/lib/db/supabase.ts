import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { serverEnv } from '@/lib/util/env';

let cached: SupabaseClient | null = null;

/**
 * Service-role Supabase client. Server-only: this key bypasses RLS, so it must
 * never be imported from a client component. Authorisation is enforced in the
 * repository layer by always scoping queries to the authenticated user id.
 */
export function getServiceClient(): SupabaseClient {
  if (!cached) {
    cached = createClient(serverEnv.supabaseUrl, serverEnv.supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { 'X-Client-Info': 'caldrop/0.1.0' } },
    });
  }
  return cached;
}

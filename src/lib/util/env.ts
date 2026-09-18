/**
 * Centralised environment access.
 *
 * Every secret is read here and nowhere else, so it is mechanically checkable
 * that no secret leaks into a client bundle: this module is server-only.
 */
import 'server-only';

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(
      `Missing required environment variable: ${name}. See .env.example.`,
    );
  }
  return value;
}

function optional(name: string, fallback: string): string {
  const value = process.env[name];
  return value && value.trim() !== '' ? value : fallback;
}

function flag(name: string, fallback = false): boolean {
  const value = process.env[name];
  if (value === undefined) return fallback;
  return value === 'true' || value === '1';
}

export const serverEnv = {
  get openaiApiKey() {
    return required('OPENAI_API_KEY');
  },
  get openaiModel() {
    return optional('OPENAI_MODEL', 'gpt-4.1');
  },
  get googleClientId() {
    return required('GOOGLE_CLIENT_ID');
  },
  get googleClientSecret() {
    return required('GOOGLE_CLIENT_SECRET');
  },
  get supabaseUrl() {
    return required('SUPABASE_URL');
  },
  get supabaseServiceRoleKey() {
    return required('SUPABASE_SERVICE_ROLE_KEY');
  },
  get sessionSecret() {
    return required('NEXTAUTH_SECRET');
  },
  get appUrl() {
    return optional('NEXTAUTH_URL', 'http://localhost:3000').replace(/\/$/, '');
  },
  get tokenEncryptionKey() {
    return required('TOKEN_ENCRYPTION_KEY');
  },
  get defaultTimezone() {
    return optional('DEFAULT_TIMEZONE', 'Asia/Seoul');
  },
  get enableDelete() {
    return flag('ENABLE_DELETE', false);
  },
  get isProduction() {
    return process.env.NODE_ENV === 'production';
  },
} as const;

export const OAUTH_REDIRECT_PATH = '/api/auth/callback';

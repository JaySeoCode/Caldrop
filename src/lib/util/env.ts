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
  /**
   * Web push credentials. Optional: without them the app simply keeps the
   * foreground flow and never offers notifications.
   */
  get vapid() {
    return {
      publicKey: optional('VAPID_PUBLIC_KEY', ''),
      privateKey: optional('VAPID_PRIVATE_KEY', ''),
      subject: optional('VAPID_SUBJECT', 'mailto:noreply@caldrop.app'),
    };
  },
  get pushEnabled() {
    const { publicKey, privateKey } = serverEnv.vapid;
    return publicKey !== '' && privateKey !== '';
  },
  /** The Android app (Trusted Web Activity) wrapping this site, for assetlinks.json. */
  get android() {
    return {
      packageName: optional('ANDROID_PACKAGE_NAME', ''),
      /** SHA-256 signing certificate fingerprints, comma separated. */
      certFingerprints: optional('ANDROID_CERT_FINGERPRINTS', '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean),
    };
  },
  /**
   * Who runs the service, shown on the privacy policy. Kept out of the repo
   * because for an individual operator these are personal details.
   */
  get legal() {
    return {
      operatorName: optional('OPERATOR_NAME', ''),
      contactEmail: optional('PRIVACY_CONTACT_EMAIL', ''),
      /** Where the Supabase project lives, e.g. "대한민국 (서울)". */
      databaseRegion: optional('DATABASE_REGION', ''),
    };
  },
  get enableDelete() {
    return flag('ENABLE_DELETE', false);
  },
  get isProduction() {
    return process.env.NODE_ENV === 'production';
  },
} as const;

export const OAUTH_REDIRECT_PATH = '/api/auth/callback';

/**
 * Google Play Developer API: read and acknowledge subscription purchases.
 *
 * The browser hands us a purchase token; everything we believe about it comes
 * from this API, called with a service account, never from the client.
 * Authenticates with a self-signed JWT (jose) so the app needs no Google SDK.
 */
import 'server-only';
import { importPKCS8, SignJWT } from 'jose';
import type { PlaySubscriptionState } from '@/lib/billing/plan';
import { serverEnv } from '@/lib/util/env';
import { AppError } from '@/lib/util/errors';

const SCOPE = 'https://www.googleapis.com/auth/androidpublisher';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const API = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications';

interface ServiceAccountKey {
  client_email: string;
  private_key: string;
}

function readServiceAccount(): ServiceAccountKey {
  const raw = serverEnv.play.serviceAccount;
  if (!raw) {
    throw new AppError('FEATURE_DISABLED', 'Google Play billing is not configured.');
  }
  const json = raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
  const parsed = JSON.parse(json) as Partial<ServiceAccountKey>;
  if (!parsed.client_email || !parsed.private_key) {
    throw new Error('GOOGLE_PLAY_SERVICE_ACCOUNT is not a service account key.');
  }
  return { client_email: parsed.client_email, private_key: parsed.private_key };
}

let cachedToken: { value: string; expiresAt: number } | null = null;

async function accessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;

  const key = readServiceAccount();
  const assertion = await new SignJWT({ scope: SCOPE })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuer(key.client_email)
    .setAudience(TOKEN_URL)
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(await importPKCS8(key.private_key, 'RS256'));

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  if (!response.ok) {
    console.error('[caldrop] play service account token failed', response.status, await response.text());
    throw new AppError('INTERNAL', 'Could not reach Google Play.');
  }
  const body = (await response.json()) as { access_token: string; expires_in: number };
  cachedToken = { value: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
  return body.access_token;
}

async function call(path: string, init?: RequestInit): Promise<Response> {
  const { packageName } = serverEnv.play;
  return fetch(`${API}/${encodeURIComponent(packageName)}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${await accessToken()}`,
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });
}

export interface PlaySubscription {
  purchaseToken: string;
  productId: string;
  state: PlaySubscriptionState;
  expiresAt: string | null;
  acknowledged: boolean;
  /** Set when this purchase replaced an earlier one (resubscribe, plan change). */
  linkedPurchaseToken: string | null;
  testPurchase: boolean;
}

interface SubscriptionPurchaseV2 {
  subscriptionState?: PlaySubscriptionState;
  acknowledgementState?: 'ACKNOWLEDGEMENT_STATE_PENDING' | 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED';
  linkedPurchaseToken?: string;
  testPurchase?: object;
  lineItems?: Array<{ productId: string; expiryTime?: string }>;
}

/** Reads a purchase from Play. Throws NOT_FOUND for a token Play does not know. */
export async function fetchSubscription(purchaseToken: string): Promise<PlaySubscription> {
  const response = await call(
    `/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`,
  );
  if (response.status === 404 || response.status === 410 || response.status === 400) {
    throw new AppError('NOT_FOUND', 'Google Play does not recognise that purchase.');
  }
  if (!response.ok) {
    console.error('[caldrop] play subscription lookup failed', response.status, await response.text());
    throw new AppError('INTERNAL', 'Could not check the purchase with Google Play.');
  }

  const body = (await response.json()) as SubscriptionPurchaseV2;
  const items = body.lineItems ?? [];
  const item =
    items.find((line) => line.productId === serverEnv.play.subscriptionId) ?? items[0] ?? null;

  return {
    purchaseToken,
    productId: item?.productId ?? '',
    state: body.subscriptionState ?? 'SUBSCRIPTION_STATE_UNSPECIFIED',
    expiresAt: item?.expiryTime ?? null,
    acknowledged: body.acknowledgementState === 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED',
    linkedPurchaseToken: body.linkedPurchaseToken ?? null,
    testPurchase: body.testPurchase !== undefined,
  };
}

/**
 * Play refunds a purchase that is not acknowledged within three days, so this
 * runs as soon as the purchase is tied to an account.
 */
export async function acknowledgeSubscription(productId: string, purchaseToken: string): Promise<void> {
  const response = await call(
    `/purchases/subscriptions/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}:acknowledge`,
    { method: 'POST', body: '{}' },
  );
  if (!response.ok) {
    console.error('[caldrop] play acknowledge failed', response.status, await response.text());
    throw new AppError('INTERNAL', 'Could not finish the purchase with Google Play.');
  }
}

/**
 * Stops auto-renewal. The user keeps what they already paid for in Play's
 * eyes; used when the account it unlocks is deleted, so nobody is billed
 * for an account that no longer exists.
 */
export async function cancelSubscription(productId: string, purchaseToken: string): Promise<void> {
  const response = await call(
    `/purchases/subscriptions/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}:cancel`,
    { method: 'POST', body: '{}' },
  );
  if (!response.ok) {
    console.error('[caldrop] play cancel failed', response.status, await response.text());
    throw new AppError('INTERNAL', 'Could not cancel the Google Play subscription.');
  }
}

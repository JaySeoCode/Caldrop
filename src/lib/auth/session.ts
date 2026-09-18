import 'server-only';
import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';
import { serverEnv } from '@/lib/util/env';
import { AppError } from '@/lib/util/errors';
import type { SessionUser } from '@/types';

export const SESSION_COOKIE = 'caldrop_session';
export const OAUTH_STATE_COOKIE = 'caldrop_oauth_state';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
const ISSUER = 'caldrop';

function secretKey(): Uint8Array {
  return new TextEncoder().encode(serverEnv.sessionSecret);
}

export interface SessionPayload extends SessionUser {
  /** Whether a Google refresh token is on file for this user. */
  calendarConnected: boolean;
}

export async function createSessionToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({
    email: payload.email,
    name: payload.name,
    picture: payload.picture,
    timezone: payload.timezone,
    calendarConnected: payload.calendarConnected,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.id)
    .setIssuer(ISSUER)
    .setAudience(ISSUER)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secretKey());
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      issuer: ISSUER,
      audience: ISSUER,
    });
    if (typeof payload.sub !== 'string' || typeof payload.email !== 'string') return null;
    return {
      id: payload.sub,
      email: payload.email,
      name: typeof payload.name === 'string' ? payload.name : null,
      picture: typeof payload.picture === 'string' ? payload.picture : null,
      timezone: typeof payload.timezone === 'string' ? payload.timezone : serverEnv.defaultTimezone,
      calendarConnected: payload.calendarConnected === true,
    };
  } catch {
    return null;
  }
}

export function setSessionCookie(token: string): void {
  cookies().set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: serverEnv.isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });
}

export function clearSessionCookie(): void {
  cookies().set(SESSION_COOKIE, '', {
    httpOnly: true,
    secure: serverEnv.isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}

export async function getSession(): Promise<SessionPayload | null> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

/** Throws UNAUTHENTICATED instead of returning null. Used by every protected route. */
export async function requireSession(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) {
    throw new AppError('UNAUTHENTICATED', 'Please sign in with Google first.');
  }
  return session;
}

export function setOAuthStateCookie(state: string): void {
  cookies().set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: serverEnv.isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 10,
  });
}

export function readAndClearOAuthState(): string | null {
  const jar = cookies();
  const state = jar.get(OAUTH_STATE_COOKIE)?.value ?? null;
  if (state) {
    jar.set(OAUTH_STATE_COOKIE, '', { path: '/', maxAge: 0 });
  }
  return state;
}

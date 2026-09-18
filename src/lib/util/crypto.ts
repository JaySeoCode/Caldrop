/**
 * AES-256-GCM helpers used to encrypt Google refresh tokens at rest.
 *
 * Stored format: base64(iv | authTag | ciphertext), prefixed with a version
 * marker so the scheme can be rotated later without ambiguity.
 */
import 'server-only';
import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto';

const VERSION = 'v1';
const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;

function loadKey(rawKey: string): Buffer {
  const key = Buffer.from(rawKey, 'base64');
  if (key.length !== 32) {
    throw new Error(
      'TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes (base64 of 32 random bytes).',
    );
  }
  return key;
}

export function encryptSecret(plaintext: string, rawKey: string): string {
  const key = loadKey(rawKey);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${VERSION}.${Buffer.concat([iv, tag, ciphertext]).toString('base64')}`;
}

export function decryptSecret(payload: string, rawKey: string): string {
  const key = loadKey(rawKey);
  const [version, body] = payload.split('.', 2);
  if (version !== VERSION || !body) {
    throw new Error('Unsupported encrypted token format.');
  }
  const buffer = Buffer.from(body, 'base64');
  if (buffer.length <= IV_BYTES + TAG_BYTES) {
    throw new Error('Encrypted token payload is truncated.');
  }
  const iv = buffer.subarray(0, IV_BYTES);
  const tag = buffer.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const ciphertext = buffer.subarray(IV_BYTES + TAG_BYTES);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

/** Constant-time comparison for OAuth state / CSRF tokens. */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Security-relevant behaviour: token encryption, upload validation and rate
 * limiting. These are the pieces where a regression is silent but expensive.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { randomBytes } from 'node:crypto';
import { decryptSecret, encryptSecret, safeEqual } from '@/lib/util/crypto';
import {
  MAX_CLARIFICATION_ROUNDS,
  sniffImageType,
  validateClarifications,
  validateImageUpload,
  validateText,
} from '@/lib/util/upload';
import { consume, resetRateLimits } from '@/lib/util/rate-limit';
import { AppError } from '@/lib/util/errors';

const KEY = randomBytes(32).toString('base64');

describe('refresh token encryption', () => {
  it('round-trips a token', () => {
    const token = '1//0gFakeRefreshTokenValue';
    const encrypted = encryptSecret(token, KEY);
    expect(encrypted).not.toContain(token);
    expect(encrypted.startsWith('v1.')).toBe(true);
    expect(decryptSecret(encrypted, KEY)).toBe(token);
  });

  it('produces a different ciphertext every time (random IV)', () => {
    expect(encryptSecret('same', KEY)).not.toBe(encryptSecret('same', KEY));
  });

  it('refuses a tampered ciphertext (GCM auth tag)', () => {
    const encrypted = encryptSecret('secret', KEY);
    const raw = Buffer.from(encrypted.slice(3), 'base64');
    const last = raw.length - 1;
    raw.writeUInt8(raw.readUInt8(last) ^ 0xff, last);
    expect(() => decryptSecret(`v1.${raw.toString('base64')}`, KEY)).toThrow();
  });

  it('refuses a wrong key', () => {
    const encrypted = encryptSecret('secret', KEY);
    expect(() => decryptSecret(encrypted, randomBytes(32).toString('base64'))).toThrow();
  });

  it('refuses a key of the wrong length', () => {
    expect(() => encryptSecret('secret', randomBytes(16).toString('base64'))).toThrow(
      /32 bytes/,
    );
  });

  it('compares state tokens without leaking length mismatches as throws', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
  });
});

describe('upload validation', () => {
  const PNG_HEADER = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0];

  function file(bytes: number[], type: string, name = 'shot.png'): File {
    return new File([new Uint8Array(bytes)], name, { type });
  }

  it('sniffs the real type from the header', () => {
    expect(sniffImageType(new Uint8Array(PNG_HEADER))).toBe('image/png');
    expect(sniffImageType(new Uint8Array([0xff, 0xd8, 0xff, 0, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe(
      'image/jpeg',
    );
    expect(sniffImageType(new Uint8Array(Buffer.from('not an image at all')))).toBeNull();
  });

  it('accepts a real PNG', async () => {
    const validated = await validateImageUpload(file(PNG_HEADER, 'image/png'));
    expect(validated.mimeType).toBe('image/png');
    expect(validated.dataUrl.startsWith('data:image/png;base64,')).toBe(true);
    expect(validated.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('rejects a script disguised as a PNG', async () => {
    const payload = Array.from(Buffer.from('<?php system($_GET["c"]); ?>'));
    await expect(validateImageUpload(file(payload, 'image/png'))).rejects.toMatchObject({
      code: 'UNSUPPORTED_MEDIA_TYPE',
    });
  });

  it('trusts the bytes when an app mislabels a PNG as JPEG', async () => {
    const validated = await validateImageUpload(file(PNG_HEADER, 'image/jpeg', 'shot.jpg'));
    expect(validated.mimeType).toBe('image/png');
    expect(validated.dataUrl.startsWith('data:image/png;base64,')).toBe(true);
  });

  it('rejects a disallowed declared type', async () => {
    await expect(
      validateImageUpload(file(PNG_HEADER, 'image/svg+xml', 'shot.svg')),
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_MEDIA_TYPE' });
  });

  it('rejects an oversized upload without reading it', async () => {
    const big = new File(['x'], 'big.png', { type: 'image/png' });
    Object.defineProperty(big, 'size', { value: 6 * 1024 * 1024 });
    await expect(validateImageUpload(big)).rejects.toMatchObject({ code: 'PAYLOAD_TOO_LARGE' });
  });

  it('rejects empty and oversized text', () => {
    expect(() => validateText('   ')).toThrow(AppError);
    expect(() => validateText('a'.repeat(8001))).toThrow(/too long/);
    expect(validateText('  hello  ')).toBe('hello');
  });
});

describe('rate limiting', () => {
  beforeEach(() => resetRateLimits());

  it('allows up to the limit and then refuses', () => {
    const rule = { limit: 3, windowMs: 60_000 };
    for (let i = 0; i < 3; i += 1) consume('user-1', rule, 1000);
    expect(() => consume('user-1', rule, 1000)).toThrow(/Too many requests/);
  });

  it('is per key', () => {
    const rule = { limit: 1, windowMs: 60_000 };
    consume('user-1', rule, 1000);
    expect(() => consume('user-2', rule, 1000)).not.toThrow();
  });

  it('resets after the window', () => {
    const rule = { limit: 1, windowMs: 1000 };
    consume('user-1', rule, 1000);
    expect(() => consume('user-1', rule, 2500)).not.toThrow();
  });
});

describe('clarification history validation', () => {
  it('keeps only the most recent rounds', () => {
    const turns = Array.from({ length: MAX_CLARIFICATION_ROUNDS + 3 }, (_, index) => ({
      question: `q${index}`,
      answer: `a${index}`,
    }));
    const kept = validateClarifications(turns);
    expect(kept).toHaveLength(MAX_CLARIFICATION_ROUNDS);
    expect(kept.at(-1)?.answer).toBe(`a${MAX_CLARIFICATION_ROUNDS + 2}`);
  });

  it('rejects malformed history', () => {
    expect(() => validateClarifications('nope')).toThrow(AppError);
    expect(() => validateClarifications([{ question: 'q' }])).toThrow(AppError);
    expect(() => validateClarifications([{ question: 'x'.repeat(1001), answer: 'a' }])).toThrow(
      AppError,
    );
  });

  it('treats a missing field as no history', () => {
    expect(validateClarifications(undefined)).toEqual([]);
  });
});

/**
 * Fixed-window rate limiter.
 *
 * In-process by design for the MVP: it protects a single serverless instance
 * from a runaway client and bounds OpenAI spend per user. For multi-instance
 * production traffic, swap `consume` for a Redis/Upstash counter - the call
 * sites do not change.
 */
import { AppError } from '@/lib/util/errors';

interface Window {
  count: number;
  resetAt: number;
}

const windows = new Map<string, Window>();

export interface RateLimitRule {
  limit: number;
  windowMs: number;
}

export const RATE_LIMITS = {
  analyze: { limit: 20, windowMs: 60_000 },
  confirm: { limit: 40, windowMs: 60_000 },
  read: { limit: 120, windowMs: 60_000 },
  account: { limit: 20, windowMs: 60_000 },
  billing: { limit: 20, windowMs: 60_000 },
} as const satisfies Record<string, RateLimitRule>;

export function consume(key: string, rule: RateLimitRule, now = Date.now()): void {
  const existing = windows.get(key);

  if (!existing || existing.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + rule.windowMs });
    return;
  }

  if (existing.count >= rule.limit) {
    const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
    throw new AppError('RATE_LIMITED', 'Too many requests. Please slow down.', {
      retryAfterSeconds,
    });
  }

  existing.count += 1;

  // Opportunistic cleanup so the map cannot grow without bound.
  if (windows.size > 5000) {
    for (const [key2, window] of windows) {
      if (window.resetAt <= now) windows.delete(key2);
    }
  }
}

export function resetRateLimits(): void {
  windows.clear();
}

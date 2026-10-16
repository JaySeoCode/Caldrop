/**
 * Who may analyse: the trial window and cached Play subscription states. A
 * mistake here either locks out a paying user or gives the app away, and
 * neither shows up anywhere but in support mail.
 */
import { describe, expect, it } from 'vitest';
import { decidePlan, isRenewing, needsRefresh, type CachedSubscription } from '@/lib/billing/plan';

const NOW = new Date('2026-10-12T00:00:00Z');
const DAY = 86_400_000;
const at = (days: number) => new Date(NOW.getTime() + days * DAY).toISOString();

function sub(state: CachedSubscription['state'], expiresInDays: number | null): CachedSubscription {
  return { state, expiresAt: expiresInDays === null ? null : at(expiresInDays) };
}

describe('plan decision', () => {
  it('is a trial until the trial ends, then expired', () => {
    expect(decidePlan({ now: NOW, trialEndsAt: at(3), subscriptions: [] }).status).toBe('trial');
    expect(decidePlan({ now: NOW, trialEndsAt: at(-1), subscriptions: [] }).status).toBe('expired');
  });

  it('is active while a paid period runs, even inside the trial', () => {
    const plan = decidePlan({
      now: NOW,
      trialEndsAt: at(3),
      subscriptions: [sub('SUBSCRIPTION_STATE_ACTIVE', 20)],
    });
    expect(plan).toEqual({ status: 'active', activeUntil: at(20) });
  });

  it('keeps a cancelled subscription until the end of the paid period', () => {
    const subscriptions = [sub('SUBSCRIPTION_STATE_CANCELED', 5)];
    expect(decidePlan({ now: NOW, trialEndsAt: at(-30), subscriptions }).status).toBe('active');
  });

  it('does not count pending, on-hold, paused or lapsed purchases', () => {
    for (const state of [
      'SUBSCRIPTION_STATE_PENDING',
      'SUBSCRIPTION_STATE_ON_HOLD',
      'SUBSCRIPTION_STATE_PAUSED',
      'SUBSCRIPTION_STATE_EXPIRED',
    ] as const) {
      const subscriptions = [sub(state, 10)];
      expect(decidePlan({ now: NOW, trialEndsAt: at(-1), subscriptions }).status).toBe('expired');
    }
    const lapsed = [sub('SUBSCRIPTION_STATE_ACTIVE', -1)];
    expect(decidePlan({ now: NOW, trialEndsAt: at(-1), subscriptions: lapsed }).status).toBe('expired');
  });

  it('reports the latest expiry across purchases', () => {
    const subscriptions = [sub('SUBSCRIPTION_STATE_CANCELED', 2), sub('SUBSCRIPTION_STATE_ACTIVE', 30)];
    expect(decidePlan({ now: NOW, trialEndsAt: at(-1), subscriptions }).activeUntil).toBe(at(30));
  });
});

describe('subscription refresh', () => {
  it('re-reads a renewing subscription whose period has passed', () => {
    expect(needsRefresh(sub('SUBSCRIPTION_STATE_ACTIVE', -1), NOW)).toBe(true);
    expect(needsRefresh(sub('SUBSCRIPTION_STATE_IN_GRACE_PERIOD', -1), NOW)).toBe(true);
  });

  it('leaves current and finished subscriptions alone', () => {
    expect(needsRefresh(sub('SUBSCRIPTION_STATE_ACTIVE', 10), NOW)).toBe(false);
    expect(needsRefresh(sub('SUBSCRIPTION_STATE_CANCELED', -1), NOW)).toBe(false);
    expect(needsRefresh(sub('SUBSCRIPTION_STATE_EXPIRED', -1), NOW)).toBe(false);
  });
});

describe('cancel on account deletion', () => {
  it('cancels exactly the subscriptions Play would charge again', () => {
    expect(isRenewing(sub('SUBSCRIPTION_STATE_ACTIVE', 10))).toBe(true);
    expect(isRenewing(sub('SUBSCRIPTION_STATE_IN_GRACE_PERIOD', 1))).toBe(true);
    expect(isRenewing(sub('SUBSCRIPTION_STATE_CANCELED', 10))).toBe(false);
    expect(isRenewing(sub('SUBSCRIPTION_STATE_EXPIRED', -10))).toBe(false);
  });
});

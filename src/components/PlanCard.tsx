'use client';

import { useEffect, useState } from 'react';
import { ApiError, verifyPlayPurchase } from '@/lib/api-client';
import { getPlayService, getPrice, purchase, restore } from '@/lib/play-billing';
import type { BillingStatus } from '@/types';

const FALLBACK_PRICE = '₩700';

function daysLeft(until: string): number {
  return Math.max(0, Math.ceil((new Date(until).getTime() - Date.now()) / 86_400_000));
}

/**
 * Trial countdown while it runs, and the subscribe screen once it is over.
 * Purchases go through Google Play; outside the Play Store app this explains
 * where to subscribe instead of offering a button that cannot work.
 */
export function PlanCard({
  billing,
  onChange,
}: {
  billing: BillingStatus;
  onChange: (billing: BillingStatus) => void;
}) {
  const [service, setService] = useState<Awaited<ReturnType<typeof getPlayService>>>(null);
  const [price, setPrice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const productId = billing.productId;
  const expired = billing.status === 'expired';

  useEffect(() => {
    if (!productId) return;
    let cancelled = false;
    void getPlayService().then(async (found) => {
      if (cancelled || !found) return;
      setService(found);
      setPrice(await getPrice(found, productId));
      // A subscriber on a new phone should not have to find a Restore button.
      if (expired) {
        const restored = await restore(found, productId, verifyPlayPurchase).catch(() => null);
        if (!cancelled && restored) onChange(restored);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [productId, expired, onChange]);

  if (!billing.enforced || billing.status === 'active') return null;

  const shownPrice = price ?? FALLBACK_PRICE;

  /** `nothing` is shown when the task finds nothing; a closed purchase sheet stays quiet. */
  const run = async (task: () => Promise<BillingStatus | null>, nothing: string | null = null) => {
    setBusy(true);
    setError(null);
    try {
      const next = await task();
      if (next) onChange(next);
      else if (nothing) setError(nothing);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'The purchase did not go through.');
    } finally {
      setBusy(false);
    }
  };

  const subscribeButton =
    service && productId ? (
      <button
        type="button"
        className={expired ? 'btn-primary w-full' : 'shrink-0 underline underline-offset-2'}
        disabled={busy}
        onClick={() => void run(() => purchase(productId, verifyPlayPurchase))}
      >
        {busy ? 'Opening Google Play...' : `Subscribe · ${shownPrice}/month`}
      </button>
    ) : null;

  if (!expired) {
    const days = daysLeft(billing.trialEndsAt);
    return (
      <p className="flex items-center justify-between gap-3 rounded-xl bg-black/[0.03] px-4 py-2.5 text-xs text-ink-soft">
        <span>
          Free trial · {days === 1 ? '1 day' : `${days} days`} left, then {shownPrice}/month
        </span>
        {subscribeButton}
      </p>
    );
  }

  return (
    <div className="card p-6">
      <span className="chip">Free trial ended</span>
      <p className="mt-4 text-sm">
        CalDrop is {shownPrice} a month. Cancel anytime in Google Play.
      </p>
      {service && productId ? (
        <div className="mt-6 space-y-3">
          {subscribeButton}
          <button
            type="button"
            className="btn-secondary w-full"
            disabled={busy}
            onClick={() =>
              void run(
                () => restore(service, productId, verifyPlayPurchase),
                'No CalDrop subscription was found on this Google Play account.',
              )
            }
          >
            Restore purchase
          </button>
        </div>
      ) : (
        <p className="mt-3 text-sm text-ink-soft">
          Subscriptions are handled by Google Play. Install CalDrop from the Play Store, subscribe
          there, and this account works everywhere you sign in.
        </p>
      )}
      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
    </div>
  );
}

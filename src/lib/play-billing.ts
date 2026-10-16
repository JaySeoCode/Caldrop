/**
 * Google Play Billing from the web app, via the Digital Goods API.
 *
 * Only available when CalDrop runs as the Play Store app (a Trusted Web
 * Activity built with Play Billing enabled). In a normal browser every
 * function here reports "not available" and the UI says where to subscribe.
 *
 * The browser never decides that someone has paid: it obtains a purchase token
 * from Play and hands it to the server, which checks it with Google.
 */
import type { BillingStatus } from '@/types';

const PLAY_BILLING = 'https://play.google.com/billing';

interface ItemDetails {
  itemId: string;
  price: { currency: string; value: string };
}

interface PurchaseDetails {
  itemId: string;
  purchaseToken: string;
}

interface DigitalGoodsService {
  getDetails(itemIds: string[]): Promise<ItemDetails[]>;
  listPurchases(): Promise<PurchaseDetails[]>;
}

declare global {
  interface Window {
    getDigitalGoodsService?: (paymentMethod: string) => Promise<DigitalGoodsService>;
  }
}

export async function getPlayService(): Promise<DigitalGoodsService | null> {
  if (typeof window === 'undefined' || !window.getDigitalGoodsService) return null;
  try {
    return await window.getDigitalGoodsService(PLAY_BILLING);
  } catch {
    // Present but unusable: a browser tab, or an app built without Play Billing.
    return null;
  }
}

/** The localized price Play will charge, e.g. "$1.99". */
export async function getPrice(service: DigitalGoodsService, productId: string): Promise<string | null> {
  try {
    const [item] = await service.getDetails([productId]);
    if (!item) return null;
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: item.price.currency,
    }).format(Number(item.price.value));
  } catch {
    return null;
  }
}

/**
 * Runs the Play purchase sheet. Resolves with the new status, or null when the
 * user closed the sheet. The sheet is only marked complete after the server
 * has recorded the purchase.
 */
export async function purchase(
  productId: string,
  verify: (purchaseToken: string) => Promise<BillingStatus>,
): Promise<BillingStatus | null> {
  const request = new PaymentRequest([{ supportedMethods: PLAY_BILLING, data: { sku: productId } }], {
    // Required by the PaymentRequest constructor; Play shows its own price.
    total: { label: 'Total', amount: { currency: 'USD', value: '0' } },
  });

  let response: PaymentResponse;
  try {
    response = await request.show();
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return null;
    throw error;
  }

  const { purchaseToken } = response.details as { purchaseToken: string };
  try {
    const status = await verify(purchaseToken);
    await response.complete('success');
    return status;
  } catch (error) {
    await response.complete('fail');
    throw error;
  }
}

/** Re-links purchases this Play account already owns (new phone, reinstall). */
export async function restore(
  service: DigitalGoodsService,
  productId: string,
  verify: (purchaseToken: string) => Promise<BillingStatus>,
): Promise<BillingStatus | null> {
  const owned = (await service.listPurchases()).filter((item) => item.itemId === productId);
  let latest: BillingStatus | null = null;
  for (const item of owned) latest = await verify(item.purchaseToken);
  return latest;
}

'use client';

/**
 * Browser half of result notifications.
 *
 * Everything here degrades to "not available" rather than throwing: an older
 * browser, a denied permission or a server without VAPID keys must all leave
 * the normal in-app flow untouched.
 */

export type PushState = 'unsupported' | 'unconfigured' | 'denied' | 'off' | 'on';

const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '';

function supported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/** VAPID keys travel as base64url; PushManager wants raw bytes. */
function toApplicationServerKey(base64Url: string): ArrayBuffer {
  const padded = base64Url.padEnd(base64Url.length + ((4 - (base64Url.length % 4)) % 4), '=');
  const binary = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!supported()) return null;
  try {
    return await navigator.serviceWorker.ready;
  } catch {
    return null;
  }
}

export async function readPushState(): Promise<PushState> {
  if (!supported()) return 'unsupported';
  if (!publicKey) return 'unconfigured';
  if (Notification.permission === 'denied') return 'denied';

  const ready = await registration();
  const subscription = await ready?.pushManager.getSubscription().catch(() => null);
  return subscription ? 'on' : 'off';
}

/**
 * Asks for permission, subscribes, and registers the subscription server-side.
 * Returns the resulting state so the caller can render the truth rather than
 * an assumption.
 */
export async function enablePush(): Promise<PushState> {
  if (!supported()) return 'unsupported';
  if (!publicKey) return 'unconfigured';

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off';

  const ready = await registration();
  if (!ready) return 'unsupported';

  let subscription = await ready.pushManager.getSubscription().catch(() => null);
  if (!subscription) {
    try {
      subscription = await ready.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: toApplicationServerKey(publicKey),
      });
    } catch {
      return 'off';
    }
  }

  const response = await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(subscription.toJSON()),
  });
  if (!response.ok) {
    // A subscription the server does not know about would silently never fire.
    await subscription.unsubscribe().catch(() => undefined);
    return 'off';
  }
  return 'on';
}

export async function disablePush(): Promise<PushState> {
  const ready = await registration();
  const subscription = await ready?.pushManager.getSubscription().catch(() => null);
  if (!subscription) return 'off';

  await fetch('/api/push/subscribe', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint: subscription.endpoint }),
  }).catch(() => undefined);
  await subscription.unsubscribe().catch(() => undefined);
  return 'off';
}

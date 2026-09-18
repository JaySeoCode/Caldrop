'use client';

import { useEffect } from 'react';

/** Registers the share-target service worker. Renders nothing. */
export function ServiceWorker() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((error: unknown) => {
      console.warn('[caldrop] service worker registration failed', error);
    });
  }, []);

  return null;
}

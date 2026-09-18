/**
 * Reads what the service worker parked from an Android share-sheet POST.
 *
 * Browser-only. The payload is consumed exactly once - it is deleted as soon as
 * it is read - so a reload never re-analyses the same share.
 */
import { ALLOWED_IMAGE_TYPES } from '@/lib/util/upload-constants';

const SHARE_CACHE = 'caldrop-share-v1';
/** A share older than this is treated as abandoned (e.g. the user never signed in). */
const MAX_AGE_MS = 30 * 60 * 1000;

export interface SharedPayload {
  text?: string;
  image?: File;
}

interface SharedMeta {
  text?: string;
  hasImage?: boolean;
  at?: number;
}

const EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

export async function takeSharedPayload(): Promise<SharedPayload | null> {
  if (typeof window === 'undefined' || !('caches' in window)) return null;

  let cache: Cache;
  try {
    cache = await caches.open(SHARE_CACHE);
  } catch {
    return null;
  }

  const metaResponse = await cache.match('/shared/meta');
  if (!metaResponse) return null;

  const imageResponse = await cache.match('/shared/image');
  await Promise.all([cache.delete('/shared/meta'), cache.delete('/shared/image')]);

  const meta = (await metaResponse.json().catch(() => ({}))) as SharedMeta;
  if (!meta.at || Date.now() - meta.at > MAX_AGE_MS) return null;

  const payload: SharedPayload = {};
  if (meta.text && meta.text.trim()) payload.text = meta.text.trim();

  if (meta.hasImage && imageResponse) {
    const blob = await imageResponse.blob();
    if ((ALLOWED_IMAGE_TYPES as readonly string[]).includes(blob.type)) {
      payload.image = new File([blob], `shared.${EXTENSIONS[blob.type] ?? 'png'}`, {
        type: blob.type,
      });
    }
  }

  return payload.text || payload.image ? payload : null;
}

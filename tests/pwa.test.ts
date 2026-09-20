/**
 * The share-to-app path spans three files that must agree on names: the
 * manifest (share_target), the service worker (public/sw.js) and the page
 * (src/lib/shared-inbox.ts). A mismatch fails silently on the phone, so it is
 * pinned here.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ALLOWED_IMAGE_TYPES, PDF_TYPE } from '@/lib/util/upload-constants';

const root = path.resolve(__dirname, '..');
const read = (file: string) => readFileSync(path.join(root, file), 'utf8');

interface Manifest {
  start_url: string;
  display: string;
  icons: Array<{ src: string; sizes: string; purpose: string }>;
  share_target: {
    action: string;
    method: string;
    enctype: string;
    params: { files: Array<{ name: string; accept: string[] }> };
  };
}

const manifest = JSON.parse(read('public/manifest.webmanifest')) as Manifest;
const serviceWorker = read('public/sw.js');
const inbox = read('src/lib/shared-inbox.ts');

describe('PWA manifest', () => {
  it('launches as a standalone app from the root', () => {
    expect(manifest.start_url).toBe('/');
    expect(manifest.display).toBe('standalone');
  });

  it('ships every icon it declares, including a maskable one', () => {
    for (const icon of manifest.icons) {
      expect(existsSync(path.join(root, 'public', icon.src))).toBe(true);
    }
    expect(manifest.icons.some((icon) => icon.purpose === 'maskable')).toBe(true);
    expect(manifest.icons.some((icon) => icon.sizes === '512x512')).toBe(true);
    expect(existsSync(path.join(root, 'public/icons/apple-touch-icon.png'))).toBe(true);
  });
});

describe('Android share target', () => {
  const file = manifest.share_target.params.files[0];

  it('posts multipart form data to /share', () => {
    expect(manifest.share_target.action).toBe('/share');
    expect(manifest.share_target.method).toBe('POST');
    expect(manifest.share_target.enctype).toBe('multipart/form-data');
  });

  it('uses the same field name the service worker reads', () => {
    expect(file?.name).toBe('image');
    expect(serviceWorker).toContain(`form.get('${file?.name}')`);
  });

  it('accepts exactly the file types the server allows', () => {
    expect([...(file?.accept ?? [])].sort()).toEqual(
      [...ALLOWED_IMAGE_TYPES, PDF_TYPE].sort(),
    );
  });

  it('parks the share where the page looks for it', () => {
    const cacheName = /SHARE_CACHE = '([^']+)'/.exec(serviceWorker)?.[1];
    expect(cacheName).toBeTruthy();
    expect(inbox).toContain(`SHARE_CACHE = '${cacheName}'`);
    for (const key of ['/shared/meta', '/shared/image']) {
      expect(serviceWorker).toContain(key);
      expect(inbox).toContain(key);
    }
  });

  it('never caches pages or API responses', () => {
    // The only request the worker answers is the share POST.
    expect(serviceWorker).toContain("event.request.method !== 'POST' || url.pathname !== '/share'");
    expect(serviceWorker).not.toMatch(/cache\.addAll|caches\.match\(event\.request/);
  });
});

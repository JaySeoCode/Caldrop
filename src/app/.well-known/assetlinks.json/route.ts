import { NextResponse } from 'next/server';
import { serverEnv } from '@/lib/util/env';

export const dynamic = 'force-dynamic';

/**
 * Digital Asset Links: proves to Android that the Android app (a Trusted Web
 * Activity) and this site have the same owner. Without it the app shows a
 * browser URL bar.
 */
export function GET() {
  const { packageName, certFingerprints } = serverEnv.android;
  const statements =
    packageName && certFingerprints.length > 0
      ? [
          {
            relation: ['delegate_permission/common.handle_all_urls'],
            target: {
              namespace: 'android_app',
              package_name: packageName,
              sha256_cert_fingerprints: certFingerprints,
            },
          },
        ]
      : [];
  return NextResponse.json(statements, { headers: { 'Cache-Control': 'public, max-age=3600' } });
}

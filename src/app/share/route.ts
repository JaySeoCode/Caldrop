import { NextResponse, type NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Fallback for the Android share target.
 *
 * Normally the service worker intercepts POST /share before it reaches the
 * network. This route only runs when the worker is not active yet (first launch
 * after install, or storage cleared). It never touches the shared content: it
 * sends the user to the app with a hint to share again.
 */
export function POST(request: NextRequest) {
  return NextResponse.redirect(new URL('/?shared=unavailable', request.url), 303);
}

export function GET(request: NextRequest) {
  return NextResponse.redirect(new URL('/', request.url), 303);
}

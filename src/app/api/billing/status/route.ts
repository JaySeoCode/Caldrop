import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth/session';
import { getBillingStatus } from '@/lib/billing/entitlement';
import { toErrorPayload } from '@/lib/util/errors';
import { consume, RATE_LIMITS } from '@/lib/util/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Trial / subscription state for the signed-in user. */
export async function GET() {
  try {
    const session = await requireSession();
    consume(`billing:${session.id}`, RATE_LIMITS.read);
    return NextResponse.json(await getBillingStatus(session.id), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    const { status, body } = toErrorPayload(error);
    return NextResponse.json(body, { status });
  }
}

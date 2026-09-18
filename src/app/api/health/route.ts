import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Which build is live. Vercel sets VERCEL_GIT_COMMIT_SHA only for deployments
 * built from the Git integration, so `source: "git"` also proves that a push
 * reached production on its own. Exposes no configuration or secrets.
 */
export function GET() {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA ?? null;
  return NextResponse.json(
    {
      ok: true,
      commit: sha ? sha.slice(0, 7) : null,
      source: sha ? 'git' : 'cli-or-local',
      environment: process.env.VERCEL_ENV ?? 'local',
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

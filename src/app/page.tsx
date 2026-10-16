import { getSession } from '@/lib/auth/session';
import { SignIn } from '@/components/SignIn';
import { Workspace } from '@/components/Workspace';
import Link from 'next/link';
import { Header } from '@/components/Header';

export const dynamic = 'force-dynamic';

export default async function HomePage({
  searchParams,
}: {
  searchParams: { auth_error?: string; deleted?: string };
}) {
  const session = await getSession();
  const deleteEnabled = process.env.NEXT_PUBLIC_ENABLE_DELETE === 'true';

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col px-5 pb-16 pt-10 sm:pt-16">
      <Header user={session} />

      <div className="mt-10 text-center sm:mt-16">
        <h1 className="text-4xl font-semibold tracking-tight">CalDrop</h1>
        <p className="mt-2 text-sm text-ink-soft">Drop anything. It&apos;s on your calendar.</p>
      </div>

      <div className="mt-8 sm:mt-10">
        {!session && searchParams.deleted ? (
          <p className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            Your CalDrop account and its data were deleted.
          </p>
        ) : null}
        {session ? (
          <Workspace timezone={session.timezone} deleteEnabled={deleteEnabled} />
        ) : (
          <SignIn authError={searchParams.auth_error ?? null} />
        )}
      </div>

      <footer className="mt-auto flex justify-center gap-4 pt-16 text-xs text-ink-faint">
        <Link href="/privacy" className="hover:text-ink">
          Privacy Policy
        </Link>
        <Link href="/account" className="hover:text-ink">
          Account
        </Link>
      </footer>
    </main>
  );
}

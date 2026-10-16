import Link from 'next/link';
import { getSession } from '@/lib/auth/session';
import { getBillingStatus } from '@/lib/billing/entitlement';
import { DeleteAccount } from '@/components/DeleteAccount';
import { SignIn } from '@/components/SignIn';
import type { BillingStatus } from '@/types';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Account · CalDrop' };

const PLAY_SUBSCRIPTIONS = 'https://play.google.com/store/account/subscriptions';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function planLine(billing: BillingStatus | null): string | null {
  if (!billing) return null;
  if (billing.status === 'active' && billing.activeUntil) {
    return `Subscribed · current period ends ${formatDate(billing.activeUntil)}`;
  }
  if (billing.status === 'trial') return `Free trial · ends ${formatDate(billing.trialEndsAt)}`;
  return billing.enforced ? 'Free trial ended' : null;
}

/**
 * Account management, including deletion. Also the public "delete your
 * account" URL declared to Google Play, so it must make sense to someone who
 * is not signed in and may no longer have the app installed.
 */
export default async function AccountPage() {
  const session = await getSession();
  const billing = session ? await getBillingStatus(session.id).catch(() => null) : null;
  const plan = planLine(billing);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col px-5 pb-16 pt-10 sm:pt-16">
      <Link href="/" className="text-sm text-ink-faint hover:text-ink">
        &larr; CalDrop
      </Link>
      <h1 className="mt-6 text-2xl font-semibold tracking-tight">Account</h1>

      {session ? (
        <div className="mt-8 space-y-4">
          <div className="card p-6 text-sm">
            <p className="text-ink-faint">Signed in as</p>
            <p className="mt-1 font-medium">{session.email}</p>
            {plan ? <p className="mt-4 text-ink-soft">{plan}</p> : null}
          </div>

          <div className="card p-6">
            <h2 className="text-base font-semibold">Delete account</h2>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-ink-soft">
              <li>
                Deleted immediately: your profile, Google connection, input and analysis history,
                notification settings and purchase records kept by CalDrop.
              </li>
              <li>CalDrop&apos;s access to your Google account is revoked.</li>
              <li>
                Events already on your Google Calendar stay there - they are yours. Remove them in
                Google Calendar if you want them gone.
              </li>
              <li>
                A Google Play subscription stops renewing. Its payment history is kept by Google;
                you can check it in{' '}
                <a className="underline underline-offset-2" href={PLAY_SUBSCRIPTIONS}>
                  Google Play subscriptions
                </a>
                .
              </li>
              <li>
                Signing up again later does not restart the free trial. Only a one-way hash of
                your Google account id is kept for that, for one year.
              </li>
            </ul>
            <div className="mt-6">
              <DeleteAccount />
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-8 space-y-4">
          <p className="text-sm text-ink-soft">
            To delete your CalDrop account and its data, sign in with the Google account you used,
            then open this page again (Account, at the top of the app). If you can no longer sign
            in, email the contact listed in the{' '}
            <Link className="underline underline-offset-2" href="/privacy">
              privacy policy
            </Link>
            .
          </p>
          <SignIn authError={null} />
        </div>
      )}
    </main>
  );
}

import Link from 'next/link';
import { PolicyPage, Section, Table } from '@/components/PolicyParts';
import { serverEnv } from '@/lib/util/env';

export const metadata = { title: 'Privacy Policy · CalDrop' };

/** Bump when the content changes; users are told in-app before it takes effect. */
const EFFECTIVE_DATE = 'October 17, 2026';

/**
 * The policy linked from the Play Store listing. Written against what the code
 * actually does - every claim here has a place in the code that makes it true.
 * Change both together, and keep the Korean version (/privacy/ko) saying the
 * same thing.
 */
export default function PrivacyPage() {
  const { operatorName, contactEmail, databaseRegionEn } = serverEnv.legal;
  const operator = operatorName || '[operator name - OPERATOR_NAME not set]';
  const email = contactEmail || '[contact - PRIVACY_CONTACT_EMAIL not set]';
  const region = databaseRegionEn || '[region - DATABASE_REGION_EN not set]';

  return (
    <PolicyPage lang="en" title="Privacy Policy" switchTo={{ href: '/privacy/ko', label: '한국어' }}>
      <p className="mt-3 text-sm text-ink-soft">
        CalDrop (&ldquo;the service&rdquo;) is operated by {operator} (&ldquo;we&rdquo;). This policy
        explains what personal information the service handles, why, and what you can do about it.
      </p>
      <p className="mt-2 text-xs text-ink-faint">Effective: {EFFECTIVE_DATE}</p>

      <Section title="1. Information we handle">
        <Table
          head={['Category', 'What', 'When']}
          rows={[
            [
              'Account',
              'Google account identifier, email address, name, profile picture URL, time zone',
              'When you sign in with Google',
            ],
            [
              'Calendar connection',
              'Google refresh token (stored encrypted), granted permission scopes',
              'When you sign in with Google',
            ],
            [
              'Calendar events',
              'Title, time, place and description of events in the period your input refers to (read for the analysis, not stored); the ID and content of events the service created or changed',
              'Read from Google Calendar when you analyze or add something',
            ],
            [
              'Your input',
              'Text you type or dictate, and the AI analysis result (the proposed events). Screenshots and PDFs are not stored; only a SHA-256 hash is kept to spot duplicates',
              'When you submit something',
            ],
            ['Notifications', 'Web push subscription address and its encryption keys', 'When you turn notifications on'],
            [
              'Billing',
              'Google Play purchase token, subscription state and expiry, free trial end date',
              'When your trial starts or you subscribe',
            ],
            [
              'Collected automatically',
              'Session cookie, server access logs (IP address, request time and similar)',
              'When you use the service',
            ],
          ]}
        />
        <p>
          Payment details such as card numbers are handled by Google Play. We never receive them.
        </p>
        <p>
          Voice input (the mic button) uses the speech recognition built into your browser (in
          Chrome, provided by Google). Your voice is never sent to or stored by our servers; only the
          resulting text is handled, like anything you type.
        </p>
      </Section>

      <Section title="2. Why we use it">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>To identify you and keep you signed in</li>
          <li>
            To read events out of the text, images and PDFs you submit and propose additions or
            changes to your Google Calendar
          </li>
          <li>To add or change the events you confirm, undo them, and send result notifications</li>
          <li>To run the free trial and the paid subscription, and to stop the trial being reused</li>
          <li>To investigate errors and prevent abuse</li>
        </ul>
        <p>
          We do not use your information for advertising, marketing or profiling, and we do not sell
          or share it for those purposes.
        </p>
      </Section>

      <Section title="3. How long we keep it">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            Everything is deleted without delay when you delete your account, which you can do
            yourself on the{' '}
            <Link className="underline underline-offset-2" href="/account">
              Account page
            </Link>
            .
          </li>
          <li>
            One exception: to stop the free trial being restarted, we keep a one-way keyed hash of
            your Google account identifier (it cannot be turned back into the identifier) and your
            trial end date for one year after deletion, then delete it.
          </li>
          <li>Screenshots and PDFs are discarded as soon as the analysis finishes.</li>
          <li>Server access logs are kept for the period set by our host&apos;s (Vercel) log retention.</li>
          <li>
            Deleted data is removed in a way that cannot be recovered. Anything the law requires us
            to keep is kept separately, for that period only.
          </li>
        </ul>
      </Section>

      <Section title="4. Service providers and international transfers">
        <p>
          We rely on the providers below to run the service. Some of them process data outside your
          country, including in the United States and South Korea. Data is sent to them encrypted
          over the network when you use the service. If you do not want this, you can stop using the
          service and delete your account.
        </p>
        <Table
          head={['Provider (country)', 'Data', 'Purpose', 'Retention']}
          rows={[
            [
              'OpenAI, L.L.C. (US)',
              'Submitted text, images and PDFs; the calendar details needed for the analysis (title, time, place)',
              'AI analysis of your input',
              'Up to 30 days for abuse monitoring under OpenAI API policy, then deleted. Not used to train models',
            ],
            [`Supabase, Inc. (${region})`, 'Everything stored in section 1', 'Database', 'Until you delete your account'],
            ['Vercel Inc. (US)', 'All requests to the service, access logs', 'Hosting', "Vercel's log retention period"],
            [
              'Google LLC (US)',
              'Sign-in, calendar and billing information',
              'Google sign-in, Google Calendar, Google Play billing',
              'Under your Google account settings',
            ],
            [
              'Web push services (Google, Mozilla, Apple and others; US)',
              'Notification content (end-to-end encrypted)',
              'Delivering result notifications',
              'Deleted once delivered',
            ],
          ]}
        />
      </Section>

      <Section title="5. Disclosure to others">
        <p>
          We do not give your personal information to anyone else, except where the law requires it
          (for example, a valid request from law enforcement).
        </p>
      </Section>

      <Section title="6. Google user data">
        <p>
          The service uses your Google Calendar data only to provide the event adding and editing
          you ask for. We do not use Google user data for advertising, do not sell it, and do not use
          it to train general-purpose AI models. We do not read Google user data except for security
          purposes, to comply with the law, or with your explicit consent.
        </p>
        <p>
          CalDrop&apos;s use and transfer to any other app of information received from Google APIs
          will adhere to the{' '}
          <a
            className="underline underline-offset-2"
            href="https://developers.google.com/terms/api-services-user-data-policy"
          >
            Google API Services User Data Policy
          </a>
          , including the Limited Use requirements.
        </p>
      </Section>

      <Section title="7. Your rights">
        <p>
          You can ask to access, correct or delete your personal information, or to have us stop
          processing it, at any time. You can delete your account directly on the{' '}
          <Link className="underline underline-offset-2" href="/account">
            Account page
          </Link>
          ; for anything else, write to the contact below and we will act on it without delay. You
          can also revoke CalDrop&apos;s access yourself in your Google account settings
          (myaccount.google.com/permissions). We will not treat you differently for exercising these
          rights.
        </p>
      </Section>

      <Section title="8. Cookies">
        <p>
          We use a single session cookie (HttpOnly) to keep you signed in. There are no advertising
          or tracking cookies and no third-party analytics. You can block cookies in your browser,
          but you will not be able to sign in.
        </p>
      </Section>

      <Section title="9. Security">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>All traffic is encrypted with HTTPS.</li>
          <li>Google refresh tokens are stored encrypted with AES-256-GCM and never sent to the browser.</li>
          <li>The database is locked down so only our server can reach it (row level security).</li>
          <li>Uploaded files are not stored, and voice never reaches our servers.</li>
        </ul>
      </Section>

      <Section title="10. Children">
        <p>
          The service is not directed to children under 13 (under 14 in South Korea), and we do not
          knowingly collect their personal information. If you believe a child has given us
          information, contact us and we will delete it.
        </p>
      </Section>

      <Section title="11. Contact">
        <p>
          Privacy contact: {operator}
          <br />
          Email: {email}
        </p>
      </Section>

      <Section title="12. Changes to this policy">
        <p>
          When this policy changes, we announce it in the service at least 7 days before the change
          takes effect, and at least 30 days before for changes that significantly affect your
          rights.
        </p>
      </Section>
    </PolicyPage>
  );
}

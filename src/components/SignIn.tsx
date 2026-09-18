'use client';

const AUTH_ERRORS: Record<string, string> = {
  access_denied: 'You cancelled the Google sign-in.',
  invalid_state: 'The sign-in link expired. Please try again.',
  calendar_scope_required: 'CalDrop needs calendar access to add events for you.',
  email_not_verified: 'Your Google email address is not verified.',
  sign_in_failed: 'Sign-in failed. Please try again.',
};

export function SignIn({ authError }: { authError: string | null }) {
  const startSignIn = () => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    window.location.href = `/api/auth/login?tz=${encodeURIComponent(tz)}`;
  };

  return (
    <div className="card p-8 text-center">
      <p className="text-sm text-ink-soft">
        Sign in with Google and allow calendar access. CalDrop reads the events around a date you
        mention, and never writes anything until you confirm it.
      </p>

      {authError ? (
        <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
          {AUTH_ERRORS[authError] ?? 'Sign-in failed. Please try again.'}
        </p>
      ) : null}

      <button type="button" className="btn-primary mt-6 w-full sm:w-auto" onClick={startSignIn}>
        Continue with Google
      </button>
    </div>
  );
}

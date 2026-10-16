'use client';

import { useState } from 'react';

/**
 * Two presses, like confirming an overlapping event: the first arms the
 * button, the second deletes. Nothing to type, nothing to mis-tap past.
 */
export function DeleteAccount() {
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = async () => {
    setBusy(true);
    setError(null);
    const response = await fetch('/api/account/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm: true }),
    }).catch(() => null);

    if (response?.ok) {
      window.location.href = '/?deleted=1';
      return;
    }
    const payload = (await response?.json().catch(() => null)) as
      | { error?: { message?: string } }
      | null;
    setError(payload?.error?.message ?? 'The account could not be deleted. Please try again.');
    setBusy(false);
    setArmed(false);
  };

  return (
    <div>
      <button
        type="button"
        className={armed ? 'btn-danger w-full' : 'btn-secondary w-full'}
        disabled={busy}
        onClick={() => (armed ? void remove() : setArmed(true))}
      >
        {busy ? 'Deleting...' : armed ? 'Press again to delete permanently' : 'Delete account'}
      </button>
      {armed && !busy ? (
        <button
          type="button"
          className="mt-2 w-full text-xs text-ink-faint underline underline-offset-2"
          onClick={() => setArmed(false)}
        >
          Keep my account
        </button>
      ) : null}
      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
    </div>
  );
}

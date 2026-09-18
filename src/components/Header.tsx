'use client';

import { useEffect } from 'react';
import type { SessionUser } from '@/types';

interface HeaderProps {
  user: (SessionUser & { calendarConnected: boolean }) | null;
}

export function Header({ user }: HeaderProps) {
  // The browser is the only reliable source of the user's IANA timezone.
  // Report it once per session if it drifted from what we have stored.
  useEffect(() => {
    if (!user) return;
    const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!browserZone || browserZone === user.timezone) return;

    void fetch('/api/auth/session', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ timezone: browserZone }),
    });
  }, [user]);

  if (!user) return <div className="h-9" />;

  return (
    <header className="flex items-center justify-between text-sm">
      <span className="chip">{user.timezone}</span>
      <div className="flex items-center gap-3">
        <span className="text-ink-soft">{user.email}</span>
        <button
          type="button"
          className="text-ink-faint underline-offset-4 hover:text-ink hover:underline"
          onClick={async () => {
            await fetch('/api/auth/logout', { method: 'POST' });
            window.location.href = '/';
          }}
        >
          Sign out
        </button>
      </div>
    </header>
  );
}

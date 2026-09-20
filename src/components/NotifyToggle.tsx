'use client';

import { useState } from 'react';
import { disablePush, enablePush, type PushState } from '@/lib/push-client';

/**
 * Turns result notifications on for this browser.
 *
 * With it on, an input is handed to the server and the user can leave: the
 * events are added and the notification says what was written, with an Undo.
 * The wording says exactly that, because it is the point at which the user
 * gives up the preview.
 */
export function NotifyToggle({
  state,
  busy,
  onChange,
}: {
  state: PushState;
  busy: boolean;
  onChange: (state: PushState) => void;
}) {
  const [working, setWorking] = useState(false);

  if (state === 'unsupported' || state === 'unconfigured') return null;

  if (state === 'denied') {
    return (
      <p className="text-center text-xs text-ink-faint">
        Notifications are blocked for CalDrop in your browser settings.
      </p>
    );
  }

  const on = state === 'on';

  return (
    <div className="flex items-start justify-between gap-3 rounded-xl border border-black/[0.06] px-4 py-3">
      <span className="min-w-0 text-sm">
        <span className="block font-medium">Notify me instead of waiting</span>
        <span className="block text-xs text-ink-faint">
          {on
            ? 'Events are added straight away; the notification shows what was added, with an Undo.'
            : 'Hand it over, close the app, and get the result as a notification.'}
        </span>
      </span>
      <button
        type="button"
        className={on ? 'btn-secondary shrink-0' : 'btn-primary shrink-0'}
        disabled={busy || working}
        onClick={async () => {
          setWorking(true);
          try {
            onChange(on ? await disablePush() : await enablePush());
          } finally {
            setWorking(false);
          }
        }}
      >
        {working ? '...' : on ? 'Turn off' : 'Turn on'}
      </button>
    </div>
  );
}

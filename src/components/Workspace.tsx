'use client';

import { useCallback, useEffect, useState } from 'react';
import { ClarificationCard } from '@/components/ClarificationCard';
import { InputCard } from '@/components/InputCard';
import { PreviewCard } from '@/components/PreviewCard';
import { ResultCard } from '@/components/ResultCard';
import { ApiError, analyze, confirm, discard } from '@/lib/api-client';
import { takeSharedPayload, type SharedPayload } from '@/lib/shared-inbox';
import type { AnalyzeResponse, ConfirmResponse } from '@/types';

type Phase = 'idle' | 'analyzing' | 'preview' | 'confirming' | 'done';

interface PendingInput {
  text?: string;
  image?: File;
}

/**
 * The AI Analysis -> Preview -> Confirm -> Calendar flow.
 *
 * The client never decides what gets written: it holds a requestId and asks the
 * server to apply the proposal the user actually saw.
 */
export function Workspace({
  timezone,
  deleteEnabled,
}: {
  timezone: string;
  deleteEnabled: boolean;
}) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [analysis, setAnalysis] = useState<AnalyzeResponse | null>(null);
  const [result, setResult] = useState<ConfirmResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Kept so a clarification answer can be re-analysed with the original input.
  const [pending, setPending] = useState<PendingInput | null>(null);
  // Content that arrived through the Android share sheet, shown in the input card.
  const [shared, setShared] = useState<SharedPayload | null>(null);

  const reset = useCallback(() => {
    setPhase('idle');
    setAnalysis(null);
    setResult(null);
    setError(null);
    setPending(null);
    setShared(null);
  }, []);

  const runAnalysis = useCallback(
    async (input: PendingInput, clarification?: string) => {
      setPhase('analyzing');
      setError(null);
      try {
        const response = await analyze({ ...input, clarification });
        setAnalysis(response);
        setPending(input);
        setPhase('preview');
      } catch (cause) {
        setError(cause instanceof ApiError ? cause.message : 'Analysis failed. Please try again.');
        setPhase('idle');
      }
    },
    [],
  );

  // Pick up a share-sheet hand-off. Checked on every mount (not only when
  // ?shared=1 is present) so a share survives a detour through Google sign-in.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const flag = params.get('shared');
    if (flag) window.history.replaceState(null, '', window.location.pathname);

    if (flag === 'unavailable' || flag === 'failed') {
      setError('The shared item did not arrive. Open CalDrop once, then share it again.');
      return;
    }

    // No cancellation: the payload is consumed on read, so a second (strict
    // mode) invocation simply finds nothing, and the first must not drop it.
    void takeSharedPayload().then((payload) => {
      if (!payload) return;
      setShared(payload);
      void runAnalysis({ text: payload.text, image: payload.image });
    });
  }, [runAnalysis]);

  const onConfirm = useCallback(async () => {
    if (!analysis) return;
    setPhase('confirming');
    setError(null);
    try {
      setResult(await confirm(analysis.requestId));
      setPhase('done');
    } catch (cause) {
      setError(
        cause instanceof ApiError ? cause.message : 'Could not update your calendar. Please try again.',
      );
      setPhase('preview');
    }
  }, [analysis]);

  const onCancel = useCallback(() => {
    if (analysis) void discard(analysis.requestId);
    reset();
  }, [analysis, reset]);

  const busy = phase === 'analyzing' || phase === 'confirming';
  const action = analysis?.action ?? null;

  return (
    <div className="space-y-4">
      {phase === 'done' && result ? (
        <ResultCard result={result} timezone={timezone} onReset={reset} />
      ) : null}

      {phase !== 'done' && action && action.action === 'NEED_CLARIFICATION' && analysis ? (
        <ClarificationCard
          action={action}
          candidates={analysis.candidates}
          timezone={analysis.timezone}
          busy={busy}
          onSubmit={(answer) => {
            if (pending) void runAnalysis(pending, answer);
          }}
          onCancel={onCancel}
        />
      ) : null}

      {phase !== 'done' && action && action.action === 'NO_ACTION' ? (
        <div className="card p-6">
          <span className="chip">Nothing to schedule</span>
          <p className="mt-4 text-sm text-ink-soft">{action.explanation}</p>
          <div className="mt-6 flex justify-end">
            <button type="button" className="btn-secondary" onClick={onCancel}>
              Try something else
            </button>
          </div>
        </div>
      ) : null}

      {phase !== 'done' &&
      action &&
      (action.action === 'CREATE' || action.action === 'UPDATE' || action.action === 'DELETE') &&
      analysis ? (
        <PreviewCard
          action={action}
          candidates={analysis.candidates}
          conflicts={analysis.conflicts}
          timezone={analysis.timezone}
          busy={busy}
          onConfirm={onConfirm}
          onCancel={onCancel}
        />
      ) : null}

      {analysis?.injectionDetected ? (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-xs text-amber-800">
          Heads up: this input contained text that tried to give CalDrop instructions. It was treated
          as content only, and nothing was acted on without your confirmation.
        </p>
      ) : null}

      {error ? (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      ) : null}

      {phase === 'idle' || phase === 'analyzing' ? (
        <InputCard
          // Remount when a new share arrives so the card shows its content.
          key={shared ? 'shared' : 'empty'}
          busy={busy}
          initial={shared}
          onAnalyze={(input) => void runAnalysis(input)}
        />
      ) : null}

      {!deleteEnabled ? (
        <p className="text-center text-xs text-ink-faint">
          Deleting events is turned off in this deployment.
        </p>
      ) : null}
    </div>
  );
}

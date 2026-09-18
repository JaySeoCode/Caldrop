/**
 * Browser-side API helpers. Client code only ever talks to our own routes -
 * it has no OpenAI key and no Google token, by construction.
 */
import type { AnalyzeResponse, ConfirmResponse } from '@/types';

interface ApiErrorBody {
  error?: { code?: string; message?: string };
}

export class ApiError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
  }
}

async function parse<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => ({}))) as T & ApiErrorBody;
  if (!response.ok) {
    throw new ApiError(
      payload.error?.code ?? 'INTERNAL',
      payload.error?.message ?? 'Something went wrong. Please try again.',
    );
  }
  return payload;
}

export interface ClarificationTurn {
  question: string;
  answer: string;
}

export async function analyze(input: {
  text?: string;
  image?: File;
  /** Every clarification round so far for this input, oldest first. */
  clarifications?: ClarificationTurn[];
  /** The last confirmed request, so "move it to 4" can resolve "it". */
  followUpOf?: string | null;
}): Promise<AnalyzeResponse> {
  const clarifications = input.clarifications?.length ? input.clarifications : undefined;
  const followUpOf = input.followUpOf ?? undefined;

  if (input.image) {
    const form = new FormData();
    form.set('image', input.image);
    if (input.text) form.set('text', input.text);
    if (clarifications) form.set('clarifications', JSON.stringify(clarifications));
    if (followUpOf) form.set('followUpOf', followUpOf);
    return parse<AnalyzeResponse>(
      await fetch('/api/ai/analyze', { method: 'POST', body: form }),
    );
  }

  return parse<AnalyzeResponse>(
    await fetch('/api/ai/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: input.text, clarifications, followUpOf }),
    }),
  );
}

export async function confirm(requestId: string): Promise<ConfirmResponse> {
  return parse<ConfirmResponse>(
    await fetch('/api/calendar/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId, decision: 'confirm' }),
    }),
  );
}

export async function discard(requestId: string): Promise<void> {
  await fetch('/api/calendar/confirm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requestId, decision: 'discard' }),
  });
}

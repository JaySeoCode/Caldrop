import { NextResponse, type NextRequest } from 'next/server';
import { requireSession } from '@/lib/auth/session';
import { analyzeInput, type CalendarPort } from '@/lib/ai/analyze';
import { createOpenAIModel } from '@/lib/ai/client';
import { calendarContextFor } from '@/lib/calendar/context';
import { findCandidateEvents, findConflicts } from '@/lib/calendar/google-calendar';
import { completeRequest, createRequest, failRequest } from '@/lib/db/requests';
import { serverEnv } from '@/lib/util/env';
import { AppError, toErrorPayload } from '@/lib/util/errors';
import { consume, RATE_LIMITS } from '@/lib/util/rate-limit';
import { validateImageUpload, validateText, MAX_TEXT_LENGTH } from '@/lib/util/upload';
import type { AnalyzeResponse, InputType } from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Analyse a screenshot or a block of text and return a *proposal*.
 *
 * This route is read-only with respect to Google Calendar: it may list events,
 * never create, update or delete one. The proposal is stored server-side and
 * only /api/calendar/confirm can act on it.
 */
export async function POST(request: NextRequest) {
  let requestId: string | null = null;

  try {
    const session = await requireSession();
    consume(`analyze:${session.id}`, RATE_LIMITS.analyze);

    const contentType = request.headers.get('content-type') ?? '';
    let text: string | null = null;
    let clarification: string | null = null;
    let image: { dataUrl: string; sha256: string } | null = null;

    if (contentType.includes('multipart/form-data')) {
      const form = await request.formData();
      const file = form.get('image');
      const rawText = form.get('text');
      const rawClarification = form.get('clarification');

      if (file instanceof File) {
        const validated = await validateImageUpload(file);
        image = { dataUrl: validated.dataUrl, sha256: validated.sha256 };
      }
      if (typeof rawText === 'string' && rawText.trim()) text = validateText(rawText);
      if (typeof rawClarification === 'string' && rawClarification.trim()) {
        clarification = validateText(rawClarification, 'clarification');
      }
    } else if (contentType.includes('application/json')) {
      const body = (await request.json()) as { text?: unknown; clarification?: unknown };
      if (body.text !== undefined) text = validateText(body.text);
      if (body.clarification !== undefined) {
        clarification = validateText(body.clarification, 'clarification');
      }
    } else {
      throw new AppError('UNSUPPORTED_MEDIA_TYPE', 'Send multipart/form-data or application/json.');
    }

    if (!text && !image) {
      throw new AppError('INVALID_INPUT', `Provide text (max ${MAX_TEXT_LENGTH} chars) or a screenshot.`);
    }

    const inputType: InputType = image ? 'image' : 'text';
    requestId = await createRequest({
      userId: session.id,
      inputType,
      originalText: text,
      // Screenshots are not persisted; only a digest is kept for the audit trail.
      imageUrl: null,
      imageSha256: image?.sha256 ?? null,
    });

    const ctx = await calendarContextFor(session.id, session.timezone);
    const calendar: CalendarPort = {
      findCandidateEvents: (options) => findCandidateEvents(ctx, options),
      findConflicts: (start, end, excludeEventId) =>
        findConflicts(ctx, start, end, excludeEventId),
    };

    const outcome = await analyzeInput(
      { model: createOpenAIModel(), calendar },
      {
        text,
        image: image ? { dataUrl: image.dataUrl } : null,
        clarification,
        timeZone: session.timezone,
        now: new Date(),
        deleteEnabled: serverEnv.enableDelete,
      },
    );

    await completeRequest(requestId, {
      action: outcome.action,
      candidateEventIds: outcome.candidates.map((candidate) => candidate.id),
      model: outcome.model,
    });

    const payload: AnalyzeResponse = {
      requestId,
      action: outcome.action,
      candidates: outcome.candidates,
      conflicts: outcome.conflicts,
      timezone: session.timezone,
      injectionDetected: outcome.injectionDetected,
    };
    return NextResponse.json(payload);
  } catch (error) {
    if (requestId) {
      await failRequest(
        requestId,
        error instanceof Error ? error.message : 'unknown error',
      ).catch(() => undefined);
    }
    const { status, body } = toErrorPayload(error);
    return NextResponse.json(body, { status });
  }
}

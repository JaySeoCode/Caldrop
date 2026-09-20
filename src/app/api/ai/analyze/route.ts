import { NextResponse, type NextRequest } from 'next/server';
import { requireSession } from '@/lib/auth/session';
import { analyzeInput, type CalendarPort, type RecentEvent } from '@/lib/ai/analyze';
import { createOpenAIModel } from '@/lib/ai/client';
import { calendarContextFor } from '@/lib/calendar/context';
import {
  findCandidateEvents,
  findConflicts,
  getEvent,
  type CalendarContext,
} from '@/lib/calendar/google-calendar';
import { getSucceededEventId } from '@/lib/db/actions';
import { completeRequest, createRequest, failRequest, getOwnedRequest } from '@/lib/db/requests';
import { serverEnv } from '@/lib/util/env';
import { AppError, toErrorPayload } from '@/lib/util/errors';
import { consume, RATE_LIMITS } from '@/lib/util/rate-limit';
import {
  validateClarifications,
  validateImageUpload,
  validatePdfUpload,
  validateText,
  MAX_TEXT_LENGTH,
  PDF_TYPE,
  type ValidatedDocument,
} from '@/lib/util/upload';
import type { AnalyzeResponse, InputType } from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** A confirmed request older than this is no longer offered as "it" / "그거". */
const RECENT_CONTEXT_MAX_AGE_MS = 2 * 60 * 60 * 1000;

function parseFollowUpOf(raw: unknown): string | null {
  if (raw === undefined || raw === null || raw === '') return null;
  if (typeof raw !== 'string' || !UUID_RE.test(raw)) {
    throw new AppError('INVALID_INPUT', 'followUpOf must be a request id.');
  }
  return raw;
}

function parseClarificationsField(raw: FormDataEntryValue | null) {
  if (typeof raw !== 'string' || !raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new AppError('INVALID_INPUT', 'clarifications must be JSON.');
  }
  return validateClarifications(parsed);
}

/**
 * Resolves the event a previous confirmed request wrote, so a follow-up like
 * "move it to 4" has a referent. Everything comes from the server side: the
 * client only names its own request id, the event is re-read from Google.
 * Any miss (someone else's id, not confirmed, too old, event since deleted)
 * just means no context - it never fails the analysis.
 */
async function loadRecentEvent(
  requestId: string,
  userId: string,
  ctx: CalendarContext,
): Promise<RecentEvent | null> {
  try {
    const previous = await getOwnedRequest(requestId, userId);
    if (!previous || previous.status !== 'confirmed' || !previous.aiResult) return null;
    if (Date.now() - new Date(previous.createdAt).getTime() > RECENT_CONTEXT_MAX_AGE_MS) return null;

    const kind = previous.aiResult.action;
    if (kind !== 'CREATE' && kind !== 'UPDATE') return null;

    const eventId = await getSucceededEventId(requestId, userId);
    if (!eventId) return null;

    const event = await getEvent(ctx, eventId);
    if (event.status === 'cancelled' || !event.canEdit) return null;
    return { action: kind, event };
  } catch {
    return null;
  }
}

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
    let clarifications: ReturnType<typeof validateClarifications> = [];
    let followUpOf: string | null = null;
    let image: { dataUrl: string; sha256: string } | null = null;
    let document: ValidatedDocument | null = null;

    if (contentType.includes('multipart/form-data')) {
      const form = await request.formData();
      const file = form.get('image');
      const rawText = form.get('text');

      if (file instanceof File) {
        // One field carries either a screenshot or a PDF; the declared type only
        // picks the validator, and each one sniffs the bytes itself.
        if (file.type === PDF_TYPE) {
          document = await validatePdfUpload(file);
        } else {
          const validated = await validateImageUpload(file);
          image = { dataUrl: validated.dataUrl, sha256: validated.sha256 };
        }
      }
      if (typeof rawText === 'string' && rawText.trim()) text = validateText(rawText);
      clarifications = parseClarificationsField(form.get('clarifications'));
      followUpOf = parseFollowUpOf(form.get('followUpOf'));
    } else if (contentType.includes('application/json')) {
      const body = (await request.json()) as {
        text?: unknown;
        clarifications?: unknown;
        followUpOf?: unknown;
      };
      if (body.text !== undefined) text = validateText(body.text);
      clarifications = validateClarifications(body.clarifications);
      followUpOf = parseFollowUpOf(body.followUpOf);
    } else {
      throw new AppError('UNSUPPORTED_MEDIA_TYPE', 'Send multipart/form-data or application/json.');
    }

    if (!text && !image && !document) {
      throw new AppError(
        'INVALID_INPUT',
        `Provide text (max ${MAX_TEXT_LENGTH} chars), a screenshot or a PDF.`,
      );
    }

    const inputType: InputType = document ? 'pdf' : image ? 'image' : 'text';
    requestId = await createRequest({
      userId: session.id,
      inputType,
      originalText: text,
      // Uploads are not persisted; only a digest is kept for the audit trail.
      imageUrl: null,
      imageSha256: image?.sha256 ?? document?.sha256 ?? null,
    });

    const ctx = await calendarContextFor(session.id, session.timezone);
    const calendar: CalendarPort = {
      findCandidateEvents: (options) => findCandidateEvents(ctx, options),
      findConflicts: (start, end, excludeEventId) =>
        findConflicts(ctx, start, end, excludeEventId),
    };
    const recentEvent = followUpOf ? await loadRecentEvent(followUpOf, session.id, ctx) : null;

    const outcome = await analyzeInput(
      { model: createOpenAIModel(), calendar },
      {
        text,
        image: image ? { dataUrl: image.dataUrl } : null,
        document: document ? { dataUrl: document.dataUrl, filename: document.filename } : null,
        clarifications,
        recentEvent,
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
      eventConflicts: outcome.eventConflicts,
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

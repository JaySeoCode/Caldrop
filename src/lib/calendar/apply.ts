import 'server-only';
import {
  createEvent,
  deleteEvent,
  getEvent,
  updateEvent,
  type CalendarContext,
} from '@/lib/calendar/google-calendar';
import { markActionFailed, markActionSucceeded, recordAction } from '@/lib/db/actions';
import { setRequestStatus } from '@/lib/db/requests';
import { AppError } from '@/lib/util/errors';
import { serverEnv } from '@/lib/util/env';
import type { EventWritePayload } from '@/lib/calendar/types';
import type { CalendarAction, CalendarEventDraft } from '@/schemas/calendar-action';
import type { CalendarEvent, ConfirmFailure } from '@/types';

/**
 * The one place a stored proposal turns into calendar writes.
 *
 * Shared by the confirm route (the user pressed a button) and the background
 * job (the result is delivered as a notification). Both paths get the same
 * ownership checks, the same per-event audit rows and the same single-use
 * guarantee - the difference is only who asked.
 */

export interface ApplyResult {
  events: CalendarEvent[];
  deletedEventId: string | null;
  failures: ConfirmFailure[];
}

export function toWritePayload(draft: CalendarEventDraft, timeZone: string): EventWritePayload {
  return {
    title: draft.title,
    start: draft.start,
    end: draft.end,
    allDay: draft.allDay,
    location: draft.location,
    description: draft.description,
    timeZone,
    recurrence: draft.recurrence,
  };
}

/** The ticked events, defaulting to all of them. Indexes are positions in `events`. */
export function parseSelection(raw: unknown, total: number): number[] {
  if (raw === undefined || raw === null) return [...Array(total).keys()];
  if (!Array.isArray(raw)) {
    throw new AppError('INVALID_INPUT', 'eventIndexes must be an array of numbers.');
  }
  const selected = [
    ...new Set(
      raw.map((value) => {
        if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value >= total) {
          throw new AppError('INVALID_INPUT', 'eventIndexes contains an unknown event.');
        }
        return value;
      }),
    ),
  ].sort((a, b) => a - b);

  if (selected.length === 0) {
    throw new AppError('INVALID_INPUT', 'Select at least one event to add.');
  }
  return selected;
}

async function writeOne(
  ctx: CalendarContext,
  input: {
    requestId: string;
    userId: string;
    draft: CalendarEventDraft;
    eventIndex: number;
    timeZone: string;
  },
): Promise<CalendarEvent> {
  const actionId = await recordAction({
    requestId: input.requestId,
    userId: input.userId,
    action: 'CREATE',
    payload: input.draft,
    eventIndex: input.eventIndex,
  });
  try {
    const event = await createEvent(ctx, toWritePayload(input.draft, input.timeZone));
    await markActionSucceeded(actionId, event.id);
    return event;
  } catch (error) {
    await markActionFailed(
      actionId,
      error instanceof Error ? error.message : 'unknown error',
    ).catch(() => undefined);
    throw error;
  }
}

/**
 * Applies a proposal. `candidateEventIds` is the set of events the analysis
 * actually retrieved from this user's calendar; an UPDATE or DELETE outside it
 * is refused, which is what stops an injected id from being acted on.
 */
export async function applyProposal(input: {
  ctx: CalendarContext;
  userId: string;
  requestId: string;
  proposal: CalendarAction;
  candidateEventIds: string[];
  timeZone: string;
  /** CREATE_MANY only; omit to write every proposed event. */
  selection?: number[];
}): Promise<ApplyResult> {
  const { ctx, userId, requestId, proposal, candidateEventIds, timeZone } = input;

  if (proposal.action === 'NO_ACTION' || proposal.action === 'NEED_CLARIFICATION') {
    throw new AppError('INVALID_INPUT', 'There is nothing to apply for this request.');
  }
  if (proposal.action === 'DELETE' && !serverEnv.enableDelete) {
    throw new AppError('FEATURE_DISABLED', 'Deleting events is disabled in this deployment.');
  }

  if (proposal.action === 'CREATE_MANY') {
    const selection = input.selection ?? [...Array(proposal.events.length).keys()];
    const events: CalendarEvent[] = [];
    const failures: ConfirmFailure[] = [];

    for (const index of selection) {
      const draft = proposal.events[index];
      if (!draft) continue;
      try {
        events.push(
          await writeOne(ctx, { requestId, userId, draft, eventIndex: index, timeZone }),
        );
      } catch (error) {
        // One bad event must not discard the ones that did get written.
        failures.push({
          index,
          title: draft.title,
          message:
            error instanceof AppError ? error.message : 'Google Calendar refused this event.',
        });
      }
    }

    if (events.length === 0) {
      throw new AppError('CALENDAR_FAILED', 'None of the events could be added.');
    }
    await setRequestStatus(requestId, 'confirmed');
    return { events, deletedEventId: null, failures };
  }

  // Ownership / access verification for mutations of existing events.
  if (proposal.action === 'UPDATE' || proposal.action === 'DELETE') {
    const targetId = proposal.targetEventId;
    if (!targetId) {
      throw new AppError('INVALID_INPUT', 'The proposal has no target event.');
    }
    if (!candidateEventIds.includes(targetId)) {
      throw new AppError(
        'FORBIDDEN',
        'The target event was not part of this analysis. Please analyse again.',
      );
    }
    // Re-read through Google so access control is enforced by the source of
    // truth, and so a since-deleted event fails loudly instead of silently.
    const existing = await getEvent(ctx, targetId);
    if (!existing.canEdit) {
      throw new AppError('FORBIDDEN', 'You do not have permission to change that event.');
    }
  }

  const actionId = await recordAction({
    requestId,
    userId,
    action: proposal.action,
    payload: proposal,
  });

  try {
    if (proposal.action === 'DELETE') {
      const targetId = proposal.targetEventId as string;
      await deleteEvent(ctx, targetId);
      await markActionSucceeded(actionId, targetId);
      await setRequestStatus(requestId, 'confirmed');
      return { events: [], deletedEventId: targetId, failures: [] };
    }

    const draft = proposal.event;
    if (!draft) throw new AppError('INVALID_INPUT', 'The proposal has no event payload.');

    const payload = toWritePayload(draft, timeZone);
    const event =
      proposal.action === 'CREATE'
        ? await createEvent(ctx, payload)
        : await updateEvent(ctx, proposal.targetEventId as string, payload);

    await markActionSucceeded(actionId, event.id);
    await setRequestStatus(requestId, 'confirmed');
    return { events: [event], deletedEventId: null, failures: [] };
  } catch (error) {
    await markActionFailed(
      actionId,
      error instanceof Error ? error.message : 'unknown error',
    ).catch(() => undefined);
    throw error;
  }
}

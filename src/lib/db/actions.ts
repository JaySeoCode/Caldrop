import 'server-only';
import { getServiceClient } from '@/lib/db/supabase';
import { AppError } from '@/lib/util/errors';
import type { CalendarActionKind } from '@/schemas/calendar-action';

export async function recordAction(input: {
  requestId: string;
  userId: string;
  action: CalendarActionKind;
  payload: unknown;
  /** Position within a multi-event proposal; 0 for a single-event request. */
  eventIndex?: number;
}): Promise<string> {
  const { data, error } = await getServiceClient()
    .from('calendar_actions')
    .insert({
      request_id: input.requestId,
      user_id: input.userId,
      action: input.action,
      payload: input.payload,
      event_index: input.eventIndex ?? 0,
      status: 'pending',
    })
    .select('id')
    .single<{ id: string }>();

  if (error || !data) {
    // A unique violation on (request_id, event_index) means this exact event of
    // this request was already written.
    if (error?.code === '23505') {
      throw new AppError('CONFLICT', 'This request has already been confirmed.');
    }
    throw new AppError('INTERNAL', 'Could not record the action.', { cause: error?.message });
  }
  return data.id;
}

export async function markActionSucceeded(
  actionId: string,
  googleEventId: string | null,
): Promise<void> {
  await getServiceClient()
    .from('calendar_actions')
    .update({ status: 'succeeded', google_event_id: googleEventId })
    .eq('id', actionId);
}

export async function markActionFailed(actionId: string, message: string): Promise<void> {
  await getServiceClient()
    .from('calendar_actions')
    .update({ status: 'failed', error: message.slice(0, 500) })
    .eq('id', actionId);
}

/**
 * The Google event id a request's *succeeded* action wrote, scoped to the owner.
 * Null for a request that was never applied, failed, or deleted its event.
 */
export async function getSucceededEventId(
  requestId: string,
  userId: string,
): Promise<string | null> {
  const { data, error } = await getServiceClient()
    .from('calendar_actions')
    .select('google_event_id')
    .eq('request_id', requestId)
    .eq('user_id', userId)
    .eq('status', 'succeeded')
    .in('action', ['CREATE', 'UPDATE'])
    // A multi-event request has several rows; the first one written is the one
    // a follow-up ("move it to 4") is most likely to mean.
    .order('event_index', { ascending: true })
    .limit(1)
    .maybeSingle<{ google_event_id: string | null }>();

  if (error) {
    throw new AppError('INTERNAL', 'Could not load the previous action.', { cause: error.message });
  }
  return data?.google_event_id ?? null;
}

import 'server-only';
import { getServiceClient } from '@/lib/db/supabase';
import { AppError } from '@/lib/util/errors';
import type { CalendarActionKind } from '@/schemas/calendar-action';

export async function recordAction(input: {
  requestId: string;
  userId: string;
  action: CalendarActionKind;
  payload: unknown;
}): Promise<string> {
  const { data, error } = await getServiceClient()
    .from('calendar_actions')
    .insert({
      request_id: input.requestId,
      user_id: input.userId,
      action: input.action,
      payload: input.payload,
      status: 'pending',
    })
    .select('id')
    .single<{ id: string }>();

  if (error || !data) {
    // A unique violation on request_id means this request was already confirmed.
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

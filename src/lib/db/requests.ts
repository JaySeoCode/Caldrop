import 'server-only';
import { getServiceClient } from '@/lib/db/supabase';
import { AppError } from '@/lib/util/errors';
import { calendarActionSchema, type CalendarAction } from '@/schemas/calendar-action';
import type { InputType } from '@/types';

export type RequestStatus = 'analyzing' | 'previewed' | 'confirmed' | 'discarded' | 'failed';

export interface CalendarRequestRecord {
  id: string;
  userId: string;
  inputType: InputType;
  originalText: string | null;
  imageUrl: string | null;
  imageSha256: string | null;
  aiResult: CalendarAction | null;
  candidateEventIds: string[];
  model: string | null;
  status: RequestStatus;
  createdAt: string;
}

interface RequestRow {
  id: string;
  user_id: string;
  input_type: InputType;
  original_text: string | null;
  image_url: string | null;
  image_sha256: string | null;
  ai_result: unknown;
  candidate_event_ids: string[] | null;
  model: string | null;
  status: RequestStatus;
  created_at: string;
}

function toRecord(row: RequestRow): CalendarRequestRecord {
  // The stored action is re-validated on read: a confirm must never execute a
  // payload that no longer satisfies the contract.
  const parsed = row.ai_result ? calendarActionSchema.safeParse(row.ai_result) : null;
  return {
    id: row.id,
    userId: row.user_id,
    inputType: row.input_type,
    originalText: row.original_text,
    imageUrl: row.image_url,
    imageSha256: row.image_sha256,
    aiResult: parsed && parsed.success ? parsed.data : null,
    candidateEventIds: row.candidate_event_ids ?? [],
    model: row.model,
    status: row.status,
    createdAt: row.created_at,
  };
}

const SELECT =
  'id, user_id, input_type, original_text, image_url, image_sha256, ai_result, candidate_event_ids, model, status, created_at';

export async function createRequest(input: {
  userId: string;
  inputType: InputType;
  originalText: string | null;
  imageUrl: string | null;
  imageSha256: string | null;
}): Promise<string> {
  const { data, error } = await getServiceClient()
    .from('calendar_requests')
    .insert({
      user_id: input.userId,
      input_type: input.inputType,
      original_text: input.originalText,
      image_url: input.imageUrl,
      image_sha256: input.imageSha256,
      status: 'analyzing',
    })
    .select('id')
    .single<{ id: string }>();

  if (error || !data) {
    throw new AppError('INTERNAL', 'Could not record the request.', { cause: error?.message });
  }
  return data.id;
}

export async function completeRequest(
  requestId: string,
  input: { action: CalendarAction; candidateEventIds: string[]; model: string },
): Promise<void> {
  const { error } = await getServiceClient()
    .from('calendar_requests')
    .update({
      ai_result: input.action,
      candidate_event_ids: input.candidateEventIds,
      model: input.model,
      status: 'previewed',
    })
    .eq('id', requestId);
  if (error) {
    throw new AppError('INTERNAL', 'Could not save the analysis.', { cause: error.message });
  }
}

export async function failRequest(requestId: string, message: string): Promise<void> {
  await getServiceClient()
    .from('calendar_requests')
    .update({ status: 'failed', error: message.slice(0, 500) })
    .eq('id', requestId);
}

export async function setRequestStatus(requestId: string, status: RequestStatus): Promise<void> {
  await getServiceClient().from('calendar_requests').update({ status }).eq('id', requestId);
}

/**
 * Loads a request *scoped to the owner*. This is the single ownership gate for
 * confirm: a request id belonging to someone else is indistinguishable from a
 * request id that does not exist.
 */
export async function getOwnedRequest(
  requestId: string,
  userId: string,
): Promise<CalendarRequestRecord | null> {
  const { data, error } = await getServiceClient()
    .from('calendar_requests')
    .select(SELECT)
    .eq('id', requestId)
    .eq('user_id', userId)
    .maybeSingle<RequestRow>();

  if (error) {
    throw new AppError('INTERNAL', 'Could not load the request.', { cause: error.message });
  }
  return data ? toRecord(data) : null;
}

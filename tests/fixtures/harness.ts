import { INTENT_SCHEMA_NAME, type IntentExtraction } from '@/schemas/intent';
import { CALENDAR_ACTION_SCHEMA_NAME, type CalendarAction } from '@/schemas/calendar-action';
import type { StructuredModel, StructuredRequest } from '@/lib/ai/client';
import type { CalendarPort } from '@/lib/ai/analyze';
import type { CalendarEvent } from '@/types';

/** "now" for every test: Friday 2026-09-18 17:20 in Asia/Seoul. */
export const NOW = new Date('2026-09-18T08:20:00.000Z');
export const TZ = 'Asia/Seoul';

export function intent(overrides: Partial<IntentExtraction> = {}): IntentExtraction {
  return {
    intentType: 'CREATE_LIKE',
    normalizedInput: 'test input',
    lookupWindow: null,
    searchKeywords: [],
    containsInstructionLikeText: false,
    ...overrides,
  };
}

export function action(overrides: Partial<CalendarAction> = {}): CalendarAction {
  return {
    action: 'CREATE',
    event: {
      title: 'Test event',
      start: '2026-09-19T19:00:00+09:00',
      end: '2026-09-19T20:00:00+09:00',
      allDay: false,
      location: null,
      description: null,
    },
    targetEventId: null,
    confidence: 0.9,
    inferredFields: [],
    missingFields: [],
    explanation: 'Test explanation.',
    ...overrides,
  };
}

export function event(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: 'evt_default',
    title: 'Existing event',
    start: '2026-09-19T15:00:00+09:00',
    end: '2026-09-19T16:00:00+09:00',
    allDay: false,
    location: null,
    description: null,
    htmlLink: null,
    status: 'confirmed',
    organizerSelf: true,
    canEdit: true,
    ...overrides,
  };
}

export interface ScriptedModel extends StructuredModel {
  readonly calls: StructuredRequest[];
}

/**
 * A model that returns a pre-written reading and decision. The pipeline is
 * exercised for real - prompts, schemas, validation and guards - without a
 * network call, so every assertion is about *our* behaviour.
 */
export function scriptedModel(script: {
  intent: IntentExtraction | unknown;
  decision: CalendarAction | unknown;
}): ScriptedModel {
  const calls: StructuredRequest[] = [];
  return {
    name: 'scripted-model',
    calls,
    async run(request: StructuredRequest): Promise<unknown> {
      calls.push(request);
      if (request.schemaName === INTENT_SCHEMA_NAME) return script.intent;
      if (request.schemaName === CALENDAR_ACTION_SCHEMA_NAME) return script.decision;
      throw new Error(`Unexpected schema: ${request.schemaName}`);
    },
  };
}

export interface FakeCalendar extends CalendarPort {
  readonly lookups: Array<{ timeMin: string; timeMax: string; keywords?: string[] }>;
}

export function fakeCalendar(events: CalendarEvent[] = []): FakeCalendar {
  const lookups: FakeCalendar['lookups'] = [];
  return {
    lookups,
    async findCandidateEvents(options) {
      lookups.push(options);
      return events;
    },
    async findConflicts(start, end, excludeEventId) {
      const startMs = new Date(start).getTime();
      const endMs = new Date(end).getTime();
      return events.filter((candidate) => {
        if (candidate.id === excludeEventId) return false;
        return (
          new Date(candidate.start).getTime() < endMs &&
          new Date(candidate.end).getTime() > startMs
        );
      });
    },
  };
}

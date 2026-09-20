import { describe, expect, it } from 'vitest';
import {
  CALENDAR_ACTIONS,
  calendarActionJsonSchema,
  calendarActionSchema,
} from '@/schemas/calendar-action';
import { intentJsonSchema } from '@/schemas/intent';
import { action } from './fixtures/harness';

/** Walks every object node of a JSON Schema. */
function objectNodes(node: unknown, found: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (!node || typeof node !== 'object') return found;
  const record = node as Record<string, unknown>;
  if (record.type === 'object') found.push(record);
  for (const value of Object.values(record)) {
    if (Array.isArray(value)) value.forEach((entry) => objectNodes(entry, found));
    else objectNodes(value, found);
  }
  return found;
}

describe('CalendarAction JSON Schema (OpenAI strict mode)', () => {
  const schemas = [
    ['calendar_action', calendarActionJsonSchema],
    ['calendar_intent', intentJsonSchema],
  ] as const;

  it.each(schemas)('%s: every object forbids additional properties', (_name, schema) => {
    for (const node of objectNodes(schema)) {
      expect(node.additionalProperties).toBe(false);
    }
  });

  it.each(schemas)('%s: every property is listed as required', (_name, schema) => {
    for (const node of objectNodes(schema)) {
      const properties = Object.keys((node.properties ?? {}) as Record<string, unknown>);
      expect(node.required).toEqual(properties);
    }
  });

  it('exposes exactly the documented actions', () => {
    expect(CALENDAR_ACTIONS).toEqual([
      'CREATE',
      'CREATE_MANY',
      'UPDATE',
      'DELETE',
      'NO_ACTION',
      'NEED_CLARIFICATION',
    ]);
    expect(calendarActionJsonSchema.properties.action.enum).toEqual([...CALENDAR_ACTIONS]);
  });
});

describe('CalendarAction validation', () => {
  it('accepts the example from the spec', () => {
    const parsed = calendarActionSchema.safeParse({
      action: 'CREATE',
      event: {
        title: '민수와 저녁',
        start: '2026-09-18T19:00:00+09:00',
        end: '2026-09-18T20:30:00+09:00',
        allDay: false,
        location: '강남',
        description: null,
        recurrence: null,
      },
      events: [],
      targetEventId: null,
      confidence: 0.95,
      inferredFields: ['end'],
      missingFields: [],
      explanation: '금요일 저녁 7시 강남에서 저녁 약속으로 판단했습니다.',
    });
    expect(parsed.success).toBe(true);
  });

  it('accepts the NEED_CLARIFICATION example from the spec', () => {
    const parsed = calendarActionSchema.safeParse({
      action: 'NEED_CLARIFICATION',
      event: null,
      events: [],
      targetEventId: null,
      confidence: 0.4,
      inferredFields: [],
      missingFields: ['date', 'start_time'],
      explanation: '만나는 날짜와 시간이 명확하지 않습니다.',
    });
    expect(parsed.success).toBe(true);
  });

  it.each([
    ['UPDATE without targetEventId', { ...action(), action: 'UPDATE' as const }],
    ['DELETE without targetEventId', { ...action(), action: 'DELETE' as const, event: null }],
    [
      'NEED_CLARIFICATION without missing fields',
      { ...action(), action: 'NEED_CLARIFICATION' as const, event: null },
    ],
    [
      'an end before the start',
      {
        ...action(),
        event: {
          title: 'Backwards',
          start: '2026-09-19T20:00:00+09:00',
          end: '2026-09-19T19:00:00+09:00',
          allDay: false,
          location: null,
          description: null,
        },
      },
    ],
    ['a non-ISO start', { ...action(), event: { ...action().event!, start: 'tomorrow 3pm' } }],
    ['confidence above 1', { ...action(), confidence: 1.4 }],
    ['an unknown inferred field', { ...action(), inferredFields: ['vibes'] }],
  ])('rejects %s', (_label, candidate) => {
    expect(calendarActionSchema.safeParse(candidate).success).toBe(false);
  });
});

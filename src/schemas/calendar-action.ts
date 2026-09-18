/**
 * The contract between the model and the rest of CalDrop.
 *
 * There are two artefacts here and they must stay in sync:
 *   1. `calendarActionJsonSchema` - handed to the OpenAI Responses API with
 *      `strict: true`, so the model *cannot* emit a shape we do not expect.
 *   2. `calendarActionSchema` (zod) - re-validates the parsed JSON on our side.
 *      Strict mode is a strong guarantee, but we never trust a remote service
 *      to be the only validator of data that drives calendar mutations.
 *
 * Strict-mode constraints that shape the schema below:
 *   - every property must be listed in `required`
 *   - `additionalProperties: false` on every object
 *   - optionality is expressed as a nullable union, never by omission
 */
import { z } from 'zod';
import { isValidIsoDateTime } from '@/lib/util/datetime';

export const CALENDAR_ACTIONS = [
  'CREATE',
  'UPDATE',
  'DELETE',
  'NO_ACTION',
  'NEED_CLARIFICATION',
] as const;

export type CalendarActionKind = (typeof CALENDAR_ACTIONS)[number];

/** Field names the model may report as inferred or missing. Closed set = no free-form drift. */
export const EVENT_FIELDS = [
  'title',
  'date',
  'start_time',
  'end_time',
  'end',
  'duration',
  'location',
  'description',
  'all_day',
  'target_event',
] as const;

export type EventField = (typeof EVENT_FIELDS)[number];

const isoDateTime = z
  .string()
  .refine(isValidIsoDateTime, { message: 'Must be an ISO-8601 date-time string' });

export const calendarEventDraftSchema = z.object({
  title: z.string().min(1).max(300),
  start: isoDateTime,
  end: isoDateTime,
  allDay: z.boolean(),
  location: z.string().max(500).nullable(),
  description: z.string().max(4000).nullable(),
});

export type CalendarEventDraft = z.infer<typeof calendarEventDraftSchema>;

export const calendarActionSchema = z
  .object({
    action: z.enum(CALENDAR_ACTIONS),
    event: calendarEventDraftSchema.nullable(),
    targetEventId: z.string().min(1).max(1024).nullable(),
    confidence: z.number().min(0).max(1),
    inferredFields: z.array(z.enum(EVENT_FIELDS)).max(10),
    missingFields: z.array(z.enum(EVENT_FIELDS)).max(10),
    explanation: z.string().min(1).max(1000),
  })
  .superRefine((value, ctx) => {
    const requireEvent = (reason: string) => {
      if (!value.event) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: reason, path: ['event'] });
      }
    };

    switch (value.action) {
      case 'CREATE':
        requireEvent('CREATE requires an event payload');
        break;
      case 'UPDATE':
        requireEvent('UPDATE requires an event payload');
        if (!value.targetEventId) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'UPDATE requires targetEventId',
            path: ['targetEventId'],
          });
        }
        break;
      case 'DELETE':
        if (!value.targetEventId) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'DELETE requires targetEventId',
            path: ['targetEventId'],
          });
        }
        break;
      case 'NEED_CLARIFICATION':
        if (value.missingFields.length === 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'NEED_CLARIFICATION requires at least one missing field',
            path: ['missingFields'],
          });
        }
        break;
      case 'NO_ACTION':
        break;
    }

    if (value.event && !value.event.allDay) {
      const start = new Date(value.event.start).getTime();
      const end = new Date(value.event.end).getTime();
      if (end <= start) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Event end must be after start',
          path: ['event', 'end'],
        });
      }
    }
  });

export type CalendarAction = z.infer<typeof calendarActionSchema>;

/** JSON Schema handed to the Responses API (`text.format`, strict mode). */
export const calendarActionJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'action',
    'event',
    'targetEventId',
    'confidence',
    'inferredFields',
    'missingFields',
    'explanation',
  ],
  properties: {
    action: {
      type: 'string',
      enum: [...CALENDAR_ACTIONS],
      description:
        'CREATE a new event, UPDATE/DELETE an existing candidate event, NO_ACTION when the input has no schedulable content, NEED_CLARIFICATION when required facts are missing or ambiguous.',
    },
    event: {
      anyOf: [
        {
          type: 'object',
          additionalProperties: false,
          required: ['title', 'start', 'end', 'allDay', 'location', 'description'],
          properties: {
            title: { type: 'string', description: 'Short event title in the language of the input.' },
            start: {
              type: 'string',
              description:
                'Start as ISO-8601 with an explicit offset, e.g. 2026-09-18T19:00:00+09:00. For all-day events use 00:00:00 in the user timezone.',
            },
            end: {
              type: 'string',
              description:
                'End as ISO-8601 with an explicit offset. Must be after start. If inferred, list "end" in inferredFields.',
            },
            allDay: { type: 'boolean' },
            location: { anyOf: [{ type: 'string' }, { type: 'null' }] },
            description: { anyOf: [{ type: 'string' }, { type: 'null' }] },
          },
        },
        { type: 'null' },
      ],
      description: 'Null for NO_ACTION, NEED_CLARIFICATION, and DELETE.',
    },
    targetEventId: {
      anyOf: [{ type: 'string' }, { type: 'null' }],
      description:
        'Google Calendar event id for UPDATE/DELETE. MUST be copied verbatim from the provided candidate events; never invented.',
    },
    confidence: { type: 'number', description: 'Confidence between 0 and 1.' },
    inferredFields: {
      type: 'array',
      items: { type: 'string', enum: [...EVENT_FIELDS] },
      description: 'Fields not stated in the input that you filled in by reasonable inference.',
    },
    missingFields: {
      type: 'array',
      items: { type: 'string', enum: [...EVENT_FIELDS] },
      description: 'Fields required to act but absent or ambiguous. Drives NEED_CLARIFICATION.',
    },
    explanation: {
      type: 'string',
      description:
        'One or two sentences, in the language of the input, explaining the decision to the user.',
    },
  },
} as const;

export const CALENDAR_ACTION_SCHEMA_NAME = 'calendar_action';

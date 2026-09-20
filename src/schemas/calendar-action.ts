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
import { isValidRecurrence } from '@/lib/util/rrule';

/** Upper bound on one CREATE_MANY proposal - a syllabus, not a whole year. */
export const MAX_EVENTS_PER_PROPOSAL = 20;

export const CALENDAR_ACTIONS = [
  'CREATE',
  'CREATE_MANY',
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
  'recurrence',
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
  /**
   * RRULE for a repeating event, describing how the first occurrence repeats.
   * Parsed before it can reach Google; see `@/lib/util/rrule`.
   */
  recurrence: z
    .string()
    .max(300)
    .refine(isValidRecurrence, { message: 'Unsupported recurrence rule' })
    .nullable(),
});

export type CalendarEventDraft = z.infer<typeof calendarEventDraftSchema>;

export const calendarActionSchema = z
  .object({
    action: z.enum(CALENDAR_ACTIONS),
    event: calendarEventDraftSchema.nullable(),
    /** CREATE_MANY only: one entry per proposed event, in reading order. */
    events: z.array(calendarEventDraftSchema).max(MAX_EVENTS_PER_PROPOSAL),
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

    if (value.action !== 'CREATE_MANY' && value.events.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'events is only allowed for CREATE_MANY',
        path: ['events'],
      });
    }

    switch (value.action) {
      case 'CREATE':
        requireEvent('CREATE requires an event payload');
        break;
      case 'CREATE_MANY':
        if (value.events.length === 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'CREATE_MANY requires at least one event',
            path: ['events'],
          });
        }
        if (value.event) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'CREATE_MANY carries its events in `events`, not `event`',
            path: ['event'],
          });
        }
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

    const drafts: Array<{ draft: CalendarEventDraft; path: Array<string | number> }> = [
      ...(value.event ? [{ draft: value.event, path: ['event'] as Array<string | number> }] : []),
      ...value.events.map((draft, index) => ({
        draft,
        path: ['events', index] as Array<string | number>,
      })),
    ];
    for (const { draft, path } of drafts) {
      if (draft.allDay) continue;
      if (new Date(draft.end).getTime() <= new Date(draft.start).getTime()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Event end must be after start',
          path: [...path, 'end'],
        });
      }
    }
  });

export type CalendarAction = z.infer<typeof calendarActionSchema>;

/** One proposed event. Shared by `event` and by each entry of `events`. */
const eventJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'start', 'end', 'allDay', 'location', 'description', 'recurrence'],
  properties: {
    title: { type: 'string', description: 'Short event title in the language of the input.' },
    start: {
      type: 'string',
      description:
        'Start as ISO-8601 with an explicit offset, e.g. 2026-09-18T19:00:00+09:00. For an all-day event use 00:00:00 in the user timezone. For a repeating event this is the FIRST occurrence.',
    },
    end: {
      type: 'string',
      description:
        'End as ISO-8601 with an explicit offset, after start. For a repeating event this ends the FIRST occurrence, never the series. If inferred, list "end" in inferredFields.',
    },
    allDay: { type: 'boolean' },
    location: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    description: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    recurrence: {
      anyOf: [{ type: 'string' }, { type: 'null' }],
      description:
        'Null unless the event repeats. Otherwise an RRULE using only FREQ (DAILY/WEEKLY/MONTHLY/YEARLY), INTERVAL, BYDAY (WEEKLY only) and exactly one of UNTIL (UTC basic format, e.g. 20260615T145959Z) or COUNT. A repeat must always be bounded. Example: "RRULE:FREQ=WEEKLY;BYDAY=TU,TH;UNTIL=20260615T145959Z".',
    },
  },
} as const;

/** JSON Schema handed to the Responses API (`text.format`, strict mode). */
export const calendarActionJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'action',
    'event',
    'events',
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
        'CREATE one new event, CREATE_MANY several new events read out of one document (a syllabus, an itinerary), UPDATE/DELETE an existing candidate event, NO_ACTION when the input has no schedulable content, NEED_CLARIFICATION when required facts are missing or ambiguous.',
    },
    event: {
      anyOf: [eventJsonSchema, { type: 'null' }],
      description: 'The single event for CREATE and UPDATE. Null for every other action.',
    },
    events: {
      type: 'array',
      items: eventJsonSchema,
      description:
        'CREATE_MANY only: every event to propose, in reading order, at most ' +
        `${MAX_EVENTS_PER_PROPOSAL}. An empty array for every other action.`,
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

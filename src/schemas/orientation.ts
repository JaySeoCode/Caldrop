/**
 * Pass 0 for photos: which way is up?
 *
 * A phone photo of a printed invitation is often sideways, and the model reads
 * sideways text badly - it fills the gaps with a plausible venue instead of the
 * one printed. A cheap low-detail look tells us how to turn the image upright
 * before the real reading.
 *
 * The model tells upright from upside down reliably, and sideways from
 * either, but not left from right: a sideways image is turned a quarter and
 * asked about again.
 */
import { z } from 'zod';

/** The edge of the image the top of the letters points toward. */
export const TEXT_TOP_DIRECTIONS = ['up', 'right', 'down', 'left'] as const;

export type TextTop = (typeof TEXT_TOP_DIRECTIONS)[number];

export const orientationSchema = z.object({
  textTop: z.enum(TEXT_TOP_DIRECTIONS),
});

export const ORIENTATION_SCHEMA_NAME = 'image_orientation';

export const orientationJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['textTop'],
  properties: {
    textTop: {
      type: 'string',
      enum: TEXT_TOP_DIRECTIONS,
      description: 'Which edge of the image the top of the printed letters points toward. "up" = already upright.',
    },
  },
} as const;

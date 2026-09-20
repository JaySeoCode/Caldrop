/**
 * Recurrence rules are model output that reaches Google almost verbatim, so the
 * parser is the guard: anything it does not understand must not get through,
 * and anything it accepts must be describable in the preview.
 */
import { describe, expect, it } from 'vitest';
import { describeRecurrence, isValidRecurrence, parseRecurrence } from '@/lib/util/rrule';

const TZ = 'Asia/Seoul';

describe('parseRecurrence', () => {
  it('normalises a weekly class schedule', () => {
    const parsed = parseRecurrence('FREQ=WEEKLY;BYDAY=TU,TH;UNTIL=20260612T145959Z');
    expect(parsed?.rule).toBe('RRULE:FREQ=WEEKLY;BYDAY=TU,TH;UNTIL=20260612T145959Z');
    expect(parsed?.byDay).toEqual(['TU', 'TH']);
  });

  it('accepts an existing RRULE prefix and lowercase input', () => {
    expect(parseRecurrence('rrule:freq=daily;count=5')?.rule).toBe('RRULE:FREQ=DAILY;COUNT=5');
  });

  it('drops a redundant INTERVAL=1 but keeps a real one', () => {
    expect(parseRecurrence('FREQ=WEEKLY;INTERVAL=1;COUNT=3')?.rule).toBe(
      'RRULE:FREQ=WEEKLY;COUNT=3',
    );
    expect(parseRecurrence('FREQ=WEEKLY;INTERVAL=2;COUNT=3')?.rule).toBe(
      'RRULE:FREQ=WEEKLY;INTERVAL=2;COUNT=3',
    );
  });

  it.each([
    ['no frequency', 'COUNT=3'],
    ['unbounded', 'FREQ=WEEKLY'],
    ['both UNTIL and COUNT', 'FREQ=WEEKLY;COUNT=3;UNTIL=20260612T145959Z'],
    ['an unknown part', 'FREQ=WEEKLY;COUNT=3;BYSETPOS=2'],
    ['a bad weekday', 'FREQ=WEEKLY;BYDAY=XX;COUNT=3'],
    ['BYDAY on a non-weekly rule', 'FREQ=MONTHLY;BYDAY=TU;COUNT=3'],
    ['a malformed UNTIL', 'FREQ=WEEKLY;UNTIL=2026-06-12'],
    ['a count beyond the cap', 'FREQ=DAILY;COUNT=5000'],
    ['an absurd interval', 'FREQ=WEEKLY;INTERVAL=500;COUNT=3'],
    ['an empty rule', ''],
  ])('rejects %s', (_label, rule) => {
    expect(parseRecurrence(rule)).toBeNull();
    expect(isValidRecurrence(rule)).toBe(false);
  });
});

describe('describeRecurrence', () => {
  it('describes what the user is about to agree to', () => {
    expect(describeRecurrence('FREQ=WEEKLY;BYDAY=TU,TH;UNTIL=20260612T145959Z', TZ)).toBe(
      'Weekly on Tue, Thu until Jun 12, 2026',
    );
    expect(describeRecurrence('FREQ=WEEKLY;INTERVAL=2;COUNT=4', TZ)).toBe(
      'Every 2 weeks, 4 times',
    );
    expect(describeRecurrence('FREQ=DAILY;COUNT=3', TZ)).toBe('Daily, 3 times');
  });

  it('returns null for a rule it would not accept', () => {
    expect(describeRecurrence('FREQ=WEEKLY', TZ)).toBeNull();
  });
});

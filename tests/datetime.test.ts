import { describe, expect, it } from 'vitest';
import {
  formatEventRange,
  isValidIsoDateTime,
  isValidTimeZone,
  timeZoneOffsetMinutes,
  toIsoInTimeZone,
  weekdayInTimeZone,
} from '@/lib/util/datetime';

describe('timezone handling', () => {
  it('formats "now" as ISO-8601 with the user offset', () => {
    const instant = new Date('2026-09-18T08:20:00.000Z');
    expect(toIsoInTimeZone(instant, 'Asia/Seoul')).toBe('2026-09-18T17:20:00+09:00');
    expect(toIsoInTimeZone(instant, 'UTC')).toBe('2026-09-18T08:20:00+00:00');
    expect(toIsoInTimeZone(instant, 'America/Los_Angeles')).toBe('2026-09-18T01:20:00-07:00');
  });

  it('handles a zone whose offset is not a whole hour', () => {
    const instant = new Date('2026-09-18T08:20:00.000Z');
    expect(toIsoInTimeZone(instant, 'Asia/Kolkata')).toBe('2026-09-18T13:50:00+05:30');
  });

  it('tracks daylight saving transitions', () => {
    // New York is UTC-4 in July and UTC-5 in January.
    expect(timeZoneOffsetMinutes(new Date('2026-07-01T12:00:00Z'), 'America/New_York')).toBe(-240);
    expect(timeZoneOffsetMinutes(new Date('2026-01-01T12:00:00Z'), 'America/New_York')).toBe(-300);
  });

  it('resolves midnight correctly', () => {
    expect(toIsoInTimeZone(new Date('2026-09-18T15:00:00.000Z'), 'Asia/Seoul')).toBe(
      '2026-09-19T00:00:00+09:00',
    );
  });

  it('names the weekday in the user timezone, not UTC', () => {
    // 23:30 UTC on Friday is already Saturday in Seoul.
    const instant = new Date('2026-09-18T23:30:00.000Z');
    expect(weekdayInTimeZone(instant, 'UTC')).toBe('Friday');
    expect(weekdayInTimeZone(instant, 'Asia/Seoul')).toBe('Saturday');
  });

  it('validates timezones', () => {
    expect(isValidTimeZone('Asia/Seoul')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
    expect(isValidTimeZone('')).toBe(false);
  });

  it('validates ISO date-times', () => {
    expect(isValidIsoDateTime('2026-09-18T19:00:00+09:00')).toBe(true);
    expect(isValidIsoDateTime('2026-09-18T19:00:00Z')).toBe(true);
    expect(isValidIsoDateTime('2026-09-18')).toBe(false);
    expect(isValidIsoDateTime('next friday')).toBe(false);
    expect(isValidIsoDateTime('2026-13-45T99:00:00Z')).toBe(false);
  });
});

describe('preview formatting', () => {
  it('renders a timed range in the user timezone', () => {
    const range = formatEventRange(
      '2026-09-18T19:00:00+09:00',
      '2026-09-18T20:30:00+09:00',
      false,
      'Asia/Seoul',
    );
    expect(range.date).toBe('Friday, September 18, 2026');
    expect(range.time).toBe('7:00 PM - 8:30 PM');
  });

  it('renders an all-day event without a time', () => {
    const range = formatEventRange(
      '2026-09-18T00:00:00+09:00',
      '2026-09-19T00:00:00+09:00',
      true,
      'Asia/Seoul',
    );
    expect(range.time).toBeNull();
  });
});

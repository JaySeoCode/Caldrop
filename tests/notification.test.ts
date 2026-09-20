/**
 * With notifications on, CalDrop writes to the calendar while nobody is
 * looking. The notification is then the whole user interface: if it does not
 * say what was written - or offers Undo for something that cannot be undone -
 * the user has no way back.
 */
import { describe, expect, it } from 'vitest';
import { buildNotification } from '@/lib/push/message';
import { action, event, TZ } from './fixtures/harness';

const REQUEST_ID = '11111111-2222-3333-4444-555555555555';

function notify(input: Partial<Parameters<typeof buildNotification>[0]>) {
  return buildNotification({
    action: action(),
    written: [],
    failures: [],
    requestId: REQUEST_ID,
    timeZone: TZ,
    ...input,
  });
}

describe('buildNotification', () => {
  it('names the single event it added and offers Undo', () => {
    const payload = notify({
      written: [event({ id: 'evt_1', title: '치과', start: '2026-09-19T15:00:00+09:00' })],
    });

    expect(payload.title).toBe('Added to your calendar');
    expect(payload.body).toContain('치과');
    expect(payload.requestId).toBe(REQUEST_ID);
    expect(payload.needsAttention).toBe(false);
  });

  it('lists every event of a multi-event write, one per line', () => {
    const written = [
      event({ id: 'a', title: 'Database Systems', recurrence: 'RRULE:FREQ=WEEKLY;BYDAY=TU;COUNT=12' }),
      event({ id: 'b', title: 'Midterm' }),
      event({ id: 'c', title: 'Final' }),
    ];
    const payload = notify({
      action: action({ action: 'CREATE_MANY', event: null, events: [] }),
      written,
    });

    expect(payload.title).toBe('3 events added');
    expect(payload.body.split('\n')).toHaveLength(3);
    for (const title of ['Database Systems', 'Midterm', 'Final']) {
      expect(payload.body).toContain(title);
    }
    // The repeat is part of what the user is agreeing to keep.
    expect(payload.body).toContain('Weekly on Tue');
  });

  it('summarises a long list instead of scrolling forever', () => {
    const written = Array.from({ length: 12 }, (_, index) =>
      event({ id: `evt_${index}`, title: `Class ${index}` }),
    );
    const payload = notify({
      action: action({ action: 'CREATE_MANY', event: null, events: [] }),
      written,
    });

    expect(payload.title).toBe('12 events added');
    expect(payload.body).toContain('and 4 more');
  });

  it('says what it skipped when part of a batch failed', () => {
    const payload = notify({
      action: action({ action: 'CREATE_MANY', event: null, events: [] }),
      written: [event({ id: 'a', title: 'Lecture' })],
      failures: [{ title: 'Midterm', message: 'Google Calendar refused this event.' }],
    });

    expect(payload.body).toContain('Skipped: Midterm');
  });

  it('does not offer Undo for an update, which cannot be restored', () => {
    const payload = notify({
      action: action({ action: 'UPDATE', targetEventId: 'evt_1' }),
      written: [event({ id: 'evt_1', title: '팀 회의' })],
    });

    expect(payload.title).toBe('Event updated');
    expect(payload.requestId).toBeNull();
  });

  it('asks the user to open the app when a detail is missing', () => {
    const payload = notify({
      action: action({
        action: 'NEED_CLARIFICATION',
        event: null,
        missingFields: ['date'],
        explanation: '어느 날인지 알려주세요.',
      }),
    });

    expect(payload.body).toBe('어느 날인지 알려주세요.');
    expect(payload.needsAttention).toBe(true);
    expect(payload.requestId).toBeNull();
  });

  it('reports a failed write rather than staying silent', () => {
    const payload = notify({
      written: [],
      failures: [{ title: '치과', message: 'Google Calendar denied this operation.' }],
    });

    expect(payload.title).toBe('Nothing was added');
    expect(payload.body).toContain('Google Calendar denied');
    expect(payload.needsAttention).toBe(true);
  });
});

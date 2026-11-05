const { makeSupabaseMock } = require('../helpers/supabaseMock');
const mockSb = makeSupabaseMock();
jest.mock('../../services/supabase', () => mockSb.supabase);

const svc = require('../../services/notifications');

const STUDENT = '11111111-1111-1111-1111-111111111111';
const validEvent = (o = {}) => ({
  type: 'challenge_assigned', entity_type: 'challenge_assignment', entity_id: 'ca-1',
  version: '2026-09-24T10:00:00.123Z', student_ids: [STUDENT],
  title: 'New challenge: Motion', actor_email: 'teacher@x.com', ...o,
});

let logSpy;
beforeEach(() => {
  mockSb.reset();
  jest.clearAllMocks();
  logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => logSpy.mockRestore());

describe('validateEvent', () => {
  test('accepts a well-formed event', () => {
    expect(svc.validateEvent(validEvent())).toBeNull();
  });

  test('accepts a scheduled calendar event (aivorah-db 0010)', () => {
    expect(svc.validateEvent(validEvent({ type: 'event_scheduled', entity_type: 'schedule_event', entity_id: 'ev_abc' }))).toBeNull();
  });

  test('accepts a B2B class post (aivorah-db 0011)', () => {
    expect(svc.validateEvent(validEvent({ type: 'class_post', entity_type: 'class_post', entity_id: 'post-1' }))).toBeNull();
  });

  test.each([
    ['unknown type', { type: 'made_up' }, /unknown type/],
    ['unknown entity type', { entity_type: 'chat' }, /unknown entity_type/],
    ['missing entity id', { entity_id: '' }, /entity_id/],
    ['bad version', { version: 'yesterday' }, /version/],
    ['blank title', { title: '   ' }, /title/],
    ['no students', { student_ids: [] }, /non-empty/],
    ['non-uuid student', { student_ids: ['asha@x.com'] }, /uuids/],
  ])('rejects %s', (_label, override, msg) => {
    expect(svc.validateEvent(validEvent(override))).toMatch(msg);
  });
});

describe('createNotificationEvent', () => {
  test('calls notify_event once and returns the fan-out summary', async () => {
    mockSb.setTable('rpc:notify_event', {
      data: {
        eventKey: 'challenge_assigned:challenge_assignment:ca-1:1790244000123', recipients: 3, duplicates: 0,
        orphanParentLinks: 1, inserted: [{ id: 'n1' }, { id: 'n2' }, { id: 'n3' }],
      },
      error: null,
    });
    const r = await svc.createNotificationEvent(validEvent());
    expect(mockSb.supabase.rpc).toHaveBeenCalledWith('notify_event', { p_event: validEvent() });
    expect(r).toMatchObject({ ok: true, recipients: 3, duplicates: 0, orphanParentLinks: 1 });
    expect(r.inserted).toHaveLength(3);
  });

  test('logs a structured line with ids and counts but no email or title', async () => {
    mockSb.setTable('rpc:notify_event', { data: { eventKey: 'k', recipients: 1, duplicates: 0, inserted: [{ id: 'n1' }] }, error: null });
    await svc.createNotificationEvent(validEvent());
    const line = JSON.parse(logSpy.mock.calls[0][0]);
    expect(line).toMatchObject({ evt: 'notification.create', ok: true, type: 'challenge_assigned', eventKey: 'k', inserted: 1, notificationIds: ['n1'] });
    expect(logSpy.mock.calls[0][0]).not.toMatch(/teacher@x\.com|Motion/);
  });

  test('reports duplicates as a successful no-op', async () => {
    mockSb.setTable('rpc:notify_event', { data: { eventKey: 'k', recipients: 3, duplicates: 3, inserted: [] }, error: null });
    const r = await svc.createNotificationEvent(validEvent());
    expect(r).toMatchObject({ ok: true, duplicates: 3 });
    expect(r.inserted).toEqual([]);
  });

  test('does not call the database for an invalid event and never throws', async () => {
    const r = await svc.createNotificationEvent(validEvent({ student_ids: [] }));
    expect(r.ok).toBe(false);
    expect(mockSb.supabase.rpc).not.toHaveBeenCalled();
  });

  test('returns ok:false (does not throw) when the database call fails', async () => {
    mockSb.setTable('rpc:notify_event', { data: null, error: { message: 'connection reset' } });
    await expect(svc.createNotificationEvent(validEvent())).resolves.toEqual({ ok: false, error: 'connection reset' });
  });
});

describe('cursor', () => {
  const row = { created_at: '2026-09-24T10:00:00.123456+00:00', id: '22222222-2222-2222-2222-222222222222' };

  test('round-trips the exact created_at string (microseconds preserved) and id', () => {
    expect(svc.decodeCursor(svc.encodeCursor(row))).toEqual({ c: row.created_at, i: row.id });
  });

  test.each([['garbage', 'not-base64!!'], ['bad id', Buffer.from(JSON.stringify({ c: row.created_at, i: 'x' })).toString('base64url')],
    ['bad date', Buffer.from(JSON.stringify({ c: 'soon', i: row.id })).toString('base64url')]])
  ('rejects %s', (_l, raw) => {
    expect(svc.decodeCursor(raw)).toBeNull();
  });
});

describe('parseLimit', () => {
  test.each([[undefined, 20], ['0', 20], ['-3', 20], ['abc', 20], ['5', 5], ['500', 50]])('%s -> %i', (raw, expected) => {
    expect(svc.parseLimit(raw)).toBe(expected);
  });
});

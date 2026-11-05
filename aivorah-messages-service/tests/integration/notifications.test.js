const { makeSupabaseMock } = require('../helpers/supabaseMock');
const mockSb = makeSupabaseMock();
const mockVerify = jest.fn();
jest.mock('../../services/supabase', () => mockSb.supabase);
jest.mock('../../services/firebaseAdmin', () => ({ auth: () => ({ verifyIdToken: mockVerify }) }));
jest.mock('../../services/push', () => ({ sendPush: jest.fn() }));
jest.mock('cloudinary', () => ({ v2: { config: jest.fn(), uploader: { upload: jest.fn() } } }));
jest.mock('groq-sdk', () => jest.fn().mockImplementation(() => ({ chat: { completions: { create: jest.fn() } } })));

const request = require('supertest');
const app = require('../../index');
const { encodeCursor } = require('../../services/notifications');

const ME = '11111111-1111-1111-1111-111111111111';
const N1 = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const AUTH = { Authorization: 'Bearer good-token' };

const row = (id, createdAt, extra = {}) => ({
  id, type: 'challenge_assigned', entity_type: 'challenge_assignment', entity_id: 'ca-' + id.slice(0, 4),
  child_id: null, title: 'New challenge', body: 'Science', data: { challengeId: 'ch1' },
  actor_role: 'teacher', created_at: createdAt, read_at: null, ...extra,
});

// Every chain the route created for a table, in call order.
const chainsFor = (table) => mockSb.supabase.from.mock.calls
  .map((c, i) => (c[0] === table ? mockSb.supabase.from.mock.results[i].value : null))
  .filter(Boolean);

let logSpy;
beforeEach(() => {
  mockSb.reset();
  jest.clearAllMocks();
  logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  mockVerify.mockResolvedValue({ uid: 'fb-1', email: 'Me@X.com' });
  mockSb.setTable('users', { data: { id: ME, role: 'student' }, error: null });
});
afterEach(() => logSpy.mockRestore());

describe('authentication boundary', () => {
  test('401 without an Authorization header', async () => {
    const res = await request(app).get('/notifications');
    expect(res.status).toBe(401);
    expect(mockSb.supabase.from).not.toHaveBeenCalled();
  });

  test('401 for a malformed header', async () => {
    const res = await request(app).get('/notifications').set('Authorization', 'Token abc');
    expect(res.status).toBe(401);
  });

  test('401 for an invalid or expired token', async () => {
    mockVerify.mockRejectedValue(new Error('expired'));
    const res = await request(app).get('/notifications').set(AUTH);
    expect(res.status).toBe(401);
  });

  test('401 when the token has no email', async () => {
    mockVerify.mockResolvedValue({ uid: 'fb-1' });
    const res = await request(app).get('/notifications').set(AUTH);
    expect(res.status).toBe(401);
  });

  test('403 when the verified email has no users row', async () => {
    mockSb.setTable('users', { data: null, error: null });
    const res = await request(app).get('/notifications').set(AUTH);
    expect(res.status).toBe(403);
  });

  test('resolves the caller from the token email (lowercased), ignoring ?userEmail=', async () => {
    mockSb.setTable('notifications', { data: [], error: null });
    const res = await request(app).get('/notifications?userEmail=victim@x.com').set(AUTH);
    expect(res.status).toBe(200);
    expect(chainsFor('users')[0].eq).toHaveBeenCalledWith('email', 'me@x.com');
    const feed = chainsFor('notifications')[0];
    expect(feed.eq).toHaveBeenCalledWith('recipient_id', ME);
    expect(feed.eq).not.toHaveBeenCalledWith(expect.anything(), 'victim@x.com');
  });
});

describe('GET /notifications', () => {
  test('returns API-shaped items ordered newest first by (created_at, id)', async () => {
    mockSb.setTable('notifications', { data: [row(N1, '2026-09-24T10:00:00+00:00', { child_id: 'c1' })], error: null });
    const res = await request(app).get('/notifications').set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      items: [{
        id: N1, type: 'challenge_assigned', entityType: 'challenge_assignment', entityId: 'ca-aaaa',
        childId: 'c1', title: 'New challenge', body: 'Science', data: { challengeId: 'ch1' },
        actorRole: 'teacher', createdAt: '2026-09-24T10:00:00+00:00', readAt: null,
      }],
      nextCursor: null,
    });
    const feed = chainsFor('notifications')[0];
    expect(feed.order.mock.calls).toEqual([['created_at', { ascending: false }], ['id', { ascending: false }]]);
    expect(feed.limit).toHaveBeenCalledWith(21);
  });

  test('returns a nextCursor built from the last item on the page when more rows exist', async () => {
    const rows = [
      row('aaaaaaaa-0000-0000-0000-000000000003', '2026-09-24T10:00:03+00:00'),
      row('aaaaaaaa-0000-0000-0000-000000000002', '2026-09-24T10:00:02+00:00'),
      row('aaaaaaaa-0000-0000-0000-000000000001', '2026-09-24T10:00:01+00:00'),
    ];
    mockSb.setTable('notifications', { data: rows, error: null });
    const res = await request(app).get('/notifications?limit=2').set(AUTH);
    expect(res.body.items.map(i => i.id)).toEqual([rows[0].id, rows[1].id]);
    expect(res.body.nextCursor).toBe(encodeCursor(rows[1]));
  });

  test('applies the keyset predicate for a cursor', async () => {
    mockSb.setTable('notifications', { data: [], error: null });
    const cursor = encodeCursor({ created_at: '2026-09-24T10:00:00.5+00:00', id: N1 });
    await request(app).get(`/notifications?cursor=${cursor}`).set(AUTH);
    expect(chainsFor('notifications')[0].or).toHaveBeenCalledWith(
      `created_at.lt."2026-09-24T10:00:00.5+00:00",and(created_at.eq."2026-09-24T10:00:00.5+00:00",id.lt.${N1})`);
  });

  test('400 for a malformed cursor', async () => {
    const res = await request(app).get('/notifications?cursor=nope').set(AUTH);
    expect(res.status).toBe(400);
  });

  test('caps the page size at 50', async () => {
    mockSb.setTable('notifications', { data: [], error: null });
    await request(app).get('/notifications?limit=1000').set(AUTH);
    expect(chainsFor('notifications')[0].limit).toHaveBeenCalledWith(51);
  });

  test('unreadOnly filters on read_at is null', async () => {
    mockSb.setTable('notifications', { data: [], error: null });
    await request(app).get('/notifications?unreadOnly=true').set(AUTH);
    expect(chainsFor('notifications')[0].is).toHaveBeenCalledWith('read_at', null);
  });

  test('500 with a generic message when the query fails', async () => {
    mockSb.setTable('notifications', { data: null, error: { message: 'db down' } });
    const res = await request(app).get('/notifications').set(AUTH);
    expect(res.status).toBe(500);
    expect(res.body.error).not.toMatch(/db down/);
  });
});

describe('GET /notifications/unread-count', () => {
  test('counts only the caller’s unread rows', async () => {
    mockSb.setTable('notifications', { count: 4, data: null, error: null });
    const res = await request(app).get('/notifications/unread-count').set(AUTH);
    expect(res.body).toEqual({ count: 4 });
    const q = chainsFor('notifications')[0];
    expect(q.eq).toHaveBeenCalledWith('recipient_id', ME);
    expect(q.is).toHaveBeenCalledWith('read_at', null);
  });
});

describe('POST /notifications/:id/read', () => {
  test('marks only that notification, scoped to the caller', async () => {
    mockSb.setTable('notifications', { data: [row(N1, '2026-09-24T10:00:00+00:00', { read_at: '2026-09-24T11:00:00+00:00' })], error: null });
    const res = await request(app).post(`/notifications/${N1}/read`).set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body.readAt).toBe('2026-09-24T11:00:00+00:00');
    const upd = chainsFor('notifications')[0];
    expect(upd.update).toHaveBeenCalledWith({ read_at: expect.any(String) });
    expect(upd.eq).toHaveBeenCalledWith('id', N1);
    expect(upd.eq).toHaveBeenCalledWith('recipient_id', ME);
  });

  test('is idempotent for an already-read notification', async () => {
    const already = row(N1, '2026-09-24T10:00:00+00:00', { read_at: '2026-09-24T09:00:00+00:00' });
    mockSb.setTable('notifications', [{ data: [], error: null }, { data: already, error: null }]);
    const res = await request(app).post(`/notifications/${N1}/read`).set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body.readAt).toBe('2026-09-24T09:00:00+00:00');
  });

  test('404 for another user’s notification', async () => {
    mockSb.setTable('notifications', [{ data: [], error: null }, { data: null, error: null }]);
    const res = await request(app).post(`/notifications/${N1}/read`).set(AUTH);
    expect(res.status).toBe(404);
  });

  test('404 without touching the database for a non-uuid id', async () => {
    const res = await request(app).post('/notifications/not-a-uuid/read').set(AUTH);
    expect(res.status).toBe(404);
    expect(chainsFor('notifications')).toHaveLength(0);
  });
});

describe('POST /notifications/read-all', () => {
  test('marks all the caller’s unread notifications', async () => {
    mockSb.setTable('notifications', { data: [{ id: 'a' }, { id: 'b' }], error: null });
    const res = await request(app).post('/notifications/read-all').set(AUTH).send({});
    expect(res.body).toEqual({ marked: 2 });
    const q = chainsFor('notifications')[0];
    expect(q.eq).toHaveBeenCalledWith('recipient_id', ME);
    expect(q.is).toHaveBeenCalledWith('read_at', null);
    expect(q.eq).not.toHaveBeenCalledWith('type', expect.anything());
  });

  test('optionally limits to one type', async () => {
    mockSb.setTable('notifications', { data: [{ id: 'a' }], error: null });
    await request(app).post('/notifications/read-all').set(AUTH).send({ type: 'challenge_assigned' });
    expect(chainsFor('notifications')[0].eq).toHaveBeenCalledWith('type', 'challenge_assigned');
  });

  test('accepts class_post as a type', async () => {
    mockSb.setTable('notifications', { data: [{ id: 'a' }], error: null });
    const res = await request(app).post('/notifications/read-all').set(AUTH).send({ type: 'class_post' });
    expect(res.status).toBe(200);
    expect(chainsFor('notifications')[0].eq).toHaveBeenCalledWith('type', 'class_post');
  });

  test('400 for an unknown type', async () => {
    const res = await request(app).post('/notifications/read-all').set(AUTH).send({ type: 'everything' });
    expect(res.status).toBe(400);
  });
});

describe('POST /messages/cleanup-system-notifs (admin key moved to env)', () => {
  const ORIGINAL = process.env.INTERNAL_API_KEY;
  afterEach(() => { process.env.INTERNAL_API_KEY = ORIGINAL; });

  test('rejects the old hard-coded key', async () => {
    process.env.INTERNAL_API_KEY = 'rotated-secret';
    const res = await request(app).post('/messages/cleanup-system-notifs').send({ adminKey: 'aivorah-admin-2026' });
    expect(res.status).toBe(403);
  });

  test('fails closed when INTERNAL_API_KEY is not configured', async () => {
    delete process.env.INTERNAL_API_KEY;
    const res = await request(app).post('/messages/cleanup-system-notifs').send({ adminKey: '' });
    expect(res.status).toBe(403);
  });

  test('accepts the configured key', async () => {
    process.env.INTERNAL_API_KEY = 'rotated-secret';
    mockSb.setTable('messages', { data: [], error: null });
    const res = await request(app).post('/messages/cleanup-system-notifs').send({ adminKey: 'rotated-secret' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, deleted: 0 });
  });
});

const { makeSupabaseMock } = require('../helpers/supabaseMock');
const mockSb = makeSupabaseMock();
jest.mock('../../services/supabase', () => mockSb.supabase);
jest.mock('../../services/push', () => ({ sendPush: jest.fn().mockResolvedValue(undefined) }));
jest.mock('cloudinary', () => ({ v2: { config: jest.fn(), uploader: { upload: jest.fn() } } }));
jest.mock('groq-sdk', () => jest.fn().mockImplementation(() => ({
  chat: { completions: { create: jest.fn().mockResolvedValue({ choices: [{ message: { content: 'AI reply text' } }] }) } },
})));

const request = require('supertest');
const app = require('../../index');
const cloudinary = require('cloudinary').v2;

beforeEach(() => { mockSb.reset(); jest.clearAllMocks(); });

describe('GET /messages/unread-count', () => {
  test('requires userEmail', async () => {
    const res = await request(app).get('/messages/unread-count');
    expect(res.status).toBe(400);
  });

  test('returns 0 with no latest when there are no unread messages', async () => {
    mockSb.setTable('messages', { count: 0, data: [], error: null });
    const res = await request(app).get('/messages/unread-count?userEmail=p@x.com');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ count: 0, latest: null });
  });

  test('returns the count and the latest unread message', async () => {
    mockSb.setTable('messages', [
      { count: 2, data: null, error: null },
      { data: { id: 'm1', sender_name: 'Teacher', sender_email: 't@x.com', content: 'hi', created_at: '2026-01-01' }, error: null },
    ]);
    const res = await request(app).get('/messages/unread-count?userEmail=p@x.com');
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(2);
    expect(res.body.latest.senderName).toBe('Teacher');
  });
});

describe('GET /messages/notifications-summary (parent)', () => {
  test('requires userEmail', async () => {
    const res = await request(app).get('/messages/notifications-summary');
    expect(res.status).toBe(400);
  });

  test('all zero with no unread messages', async () => {
    mockSb.setTable('users', { data: { id: 'p1', role: 'parent', created_at: '2025-01-01' }, error: null });
    mockSb.setTable('messages', { data: [], error: null });
    const res = await request(app).get('/messages/notifications-summary?userEmail=p@x.com');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(expect.objectContaining({ messages: 0, assignments: 0, challenges: 0, events: 0, latest: null }));
  });

  test('splits real chat vs system-notification unread messages into their own buckets', async () => {
    mockSb.setTable('users', { data: { id: 'p1', role: 'parent', created_at: '2025-01-01' }, error: null });
    mockSb.setTable('messages', {
      data: [
        { id: 'm1', sender_name: 'Teacher', sender_email: 't@x.com', content: 'Please send the form', created_at: '2026-01-03' },
        { id: 'm2', sender_name: 'Aivorah', sender_email: 'system@aivorah.com', content: 'New Assignment assigned: "HW" (Math)', created_at: '2026-01-02' },
        { id: 'm3', sender_name: 'Aivorah', sender_email: 'system@aivorah.com', content: 'New Challenge assigned: "Quiz"', created_at: '2026-01-01' },
      ],
      error: null,
    });
    const res = await request(app).get('/messages/notifications-summary?userEmail=p@x.com');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(expect.objectContaining({ messages: 1, assignments: 1, challenges: 1 }));
    expect(res.body.latest.senderName).toBe('Teacher');
    expect(res.body.notificationItems.length).toBe(2);
  });

  test('a system message from before the account was created is excluded (registration cap)', async () => {
    mockSb.setTable('users', { data: { id: 'p1', role: 'parent', created_at: '2026-06-01' }, error: null });
    mockSb.setTable('messages', {
      data: [{ id: 'm1', sender_name: 'Aivorah', sender_email: 'system@aivorah.com', content: 'New Assignment assigned: "Old" (Math)', created_at: '2025-01-01' }],
      error: null,
    });
    const res = await request(app).get('/messages/notifications-summary?userEmail=p@x.com');
    expect(res.body.assignments).toBe(0);
  });
});

describe('GET /messages/notifications-summary (schedule event recipients)', () => {
  const classEvent  = { id: 'e1', title: 'Class test', type: 'study', created_by: 'teacher', created_by_id: 'tA', student_id: 'all', created_at: '2026-09-01' };
  const otherClass  = { id: 'e2', title: 'Other class', type: 'study', created_by: 'teacher', created_by_id: 'tB', student_id: 'all', created_at: '2026-09-01' };
  const orphanAll   = { id: 'e3', title: 'No creator', type: 'study', created_by: 'teacher', created_by_id: null, student_id: 'all', created_at: '2026-09-01' };
  const parentAll   = { id: 'e4', title: 'Parent all', type: 'study', created_by: 'parent', created_by_id: 'p9', student_id: 'all', created_at: '2026-09-01' };
  const personal    = { id: 'e5', title: 'Mine', type: 'study', created_by: 'parent', created_by_id: 'p1', student_id: 's1', created_at: '2026-09-01' };

  function student(teacherIds) {
    mockSb.setTable('users', { data: { id: 's1', role: 'student', created_at: '2025-01-01' }, error: null });
    mockSb.setTable('teacher_student', { data: teacherIds.map(teacher_id => ({ teacher_id })), error: null });
    mockSb.setTable('schedule_events', { data: [classEvent, otherClass, orphanAll, parentAll, personal], error: null });
  }
  const eventIds = (res) => res.body.notificationItems.filter(i => i.type === 'event').map(i => i.id).sort();
  const eventOrFilter = () => {
    const i = mockSb.supabase.from.mock.calls.findIndex(([t]) => t === 'schedule_events');
    return i < 0 ? null : mockSb.supabase.from.mock.results[i].value.or.mock.calls[0][0];
  };

  test("student linked to Teacher A sees A's class event, not B's or unattributable ones", async () => {
    student(['tA']);
    const res = await request(app).get('/messages/notifications-summary?userEmail=s@x.com');
    expect(eventIds(res)).toEqual(['evt_e1', 'evt_e5']);
    expect(eventOrFilter()).toBe('student_id.eq.s1,and(student_id.eq.all,created_by.eq.teacher,created_by_id.in.(tA))');
  });

  test("student linked to Teacher B does not see A's class event", async () => {
    student(['tB']);
    const res = await request(app).get('/messages/notifications-summary?userEmail=s@x.com');
    expect(eventIds(res)).toEqual(['evt_e2', 'evt_e5']);
  });

  test('event items flag auto-created due reminders so the client can tell them from V2-owned events', async () => {
    student(['tA']);
    mockSb.setTable('schedule_events', { data: [classEvent, { ...personal, id: 'e6', type: 'deadline', assignment_id: 'a1' }], error: null });
    const res = await request(app).get('/messages/notifications-summary?userEmail=s@x.com');
    const flags = Object.fromEntries(res.body.notificationItems.filter(i => i.type === 'event').map(i => [i.id, i.autoDue]));
    expect(flags).toEqual({ evt_e1: false, evt_e6: true });
  });

  test('parent schedule cards are flagged autoDue false (owned by V2 event_scheduled)', async () => {
    mockSb.setTable('users', { data: { id: 'p1', role: 'parent', created_at: '2025-01-01' }, error: null });
    mockSb.setTable('messages', {
      data: [{ id: 'm1', sender_name: 'Aivorah', sender_email: 'system@aivorah.com', content: 'SCHEDULE_CARD|Kid|Trip|2026-09-10|09:00|study', created_at: '2026-09-01' }],
      error: null,
    });
    const res = await request(app).get('/messages/notifications-summary?userEmail=p@x.com');
    expect(res.body.notificationItems.find(i => i.id === 'evt_m1').autoDue).toBe(false);
  });

  test('student with no teachers gets no class-wide events', async () => {
    student([]);
    const res = await request(app).get('/messages/notifications-summary?userEmail=s@x.com');
    expect(eventIds(res)).toEqual(['evt_e5']);
    expect(eventOrFilter()).toBe('student_id.eq.s1');
  });

  test('platform admin never queries schedule events', async () => {
    mockSb.setTable('users', { data: { id: 'a1', role: 'platform_admin', created_at: '2025-01-01' }, error: null });
    mockSb.setTable('schedule_events', { data: [classEvent], error: null });
    const res = await request(app).get('/messages/notifications-summary?userEmail=a@x.com');
    expect(res.status).toBe(200);
    expect(eventOrFilter()).toBeNull();
    expect(eventIds(res)).toEqual([]);
  });

  test('parent gets only schedule cards addressed to them, never raw class events', async () => {
    mockSb.setTable('users', { data: { id: 'p1', role: 'parent', created_at: '2025-01-01' }, error: null });
    mockSb.setTable('schedule_events', { data: [classEvent], error: null });
    mockSb.setTable('messages', {
      data: [{ id: 'm1', sender_name: 'Aivorah', sender_email: 'system@aivorah.com', content: 'SCHEDULE_CARD|Kid|Trip|2026-09-10|09:00|study', created_at: '2026-09-01' }],
      error: null,
    });
    const res = await request(app).get('/messages/notifications-summary?userEmail=p@x.com');
    expect(eventOrFilter()).toBeNull();
    expect(eventIds(res)).toEqual(['evt_m1']);
  });
});

describe('POST /messages/mark-read', () => {
  test('requires userEmail', async () => {
    const res = await request(app).post('/messages/mark-read').send({});
    expect(res.status).toBe(400);
  });

  test('marks unread messages read and returns the new unread count', async () => {
    mockSb.setTable('messages', [
      { data: [{ id: 'm1' }, { id: 'm2' }], error: null }, // update().select()
      { count: 0, data: null, error: null },               // recount
    ]);
    const res = await request(app).post('/messages/mark-read').send({ userEmail: 'p@x.com' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual(expect.objectContaining({ success: true, markedCount: 2, unreadCount: 0 }));
  });
});

describe('POST /messages/mark-system-read', () => {
  test('requires userEmail', async () => {
    const res = await request(app).post('/messages/mark-system-read').send({});
    expect(res.status).toBe(400);
  });

  test('marks only assignment-prefixed unread messages when kind=assignment', async () => {
    mockSb.setTable('messages', [
      { data: [
        { id: 'm1', content: 'New Assignment assigned: "HW" (Math)' },
        { id: 'm2', content: 'New Challenge assigned: "Quiz"' },
      ], error: null },
      { data: null, error: null }, // the update
    ]);
    const res = await request(app).post('/messages/mark-system-read').send({ userEmail: 'p@x.com', kind: 'assignment' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, markedCount: 1 });
  });

  test('no matching unread system messages marks nothing', async () => {
    mockSb.setTable('messages', { data: [], error: null });
    const res = await request(app).post('/messages/mark-system-read').send({ userEmail: 'p@x.com', kind: 'challenge' });
    expect(res.body).toEqual({ success: true, markedCount: 0 });
  });
});

describe('PATCH /messages/read', () => {
  test('requires both emails', async () => {
    const res = await request(app).patch('/messages/read?userEmail=p@x.com');
    expect(res.status).toBe(400);
  });

  test('marks the thread with otherEmail as read', async () => {
    mockSb.setTable('messages', { data: [{ id: 'm1' }], error: null });
    const res = await request(app).patch('/messages/read?userEmail=p@x.com&otherEmail=t@x.com');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(expect.objectContaining({ success: true, markedCount: 1 }));
  });
});

describe('PATCH /messages/:id (edit)', () => {
  test('requires senderEmail and content', async () => {
    const res = await request(app).patch('/messages/m1').send({});
    expect(res.status).toBe(400);
  });

  test('404s when the message is not found or not owned by this sender', async () => {
    mockSb.setTable('messages', { data: null, error: null });
    const res = await request(app).patch('/messages/m1').send({ senderEmail: 'p@x.com', content: 'new' });
    expect(res.status).toBe(404);
  });

  test('updates content and marks the message edited', async () => {
    mockSb.setTable('messages', { data: { id: 'm1', content: 'new text', is_edited: true }, error: null });
    const res = await request(app).patch('/messages/m1').send({ senderEmail: 'p@x.com', content: 'new text' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: 'm1', content: 'new text', is_edited: true });
  });
});

describe('DELETE /messages/:id', () => {
  test('requires senderEmail', async () => {
    const res = await request(app).delete('/messages/m1').send({});
    expect(res.status).toBe(400);
  });

  test('deletes the message owned by this sender', async () => {
    mockSb.setTable('messages', { data: null, error: null });
    const res = await request(app).delete('/messages/m1').send({ senderEmail: 'p@x.com' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
  });
});

describe('POST /messages/:id/react', () => {
  test('requires userEmail and emoji', async () => {
    const res = await request(app).post('/messages/m1/react').send({});
    expect(res.status).toBe(400);
  });

  test('adds a new reaction', async () => {
    mockSb.setTable('message_reactions', [
      { data: null, error: null },   // existing lookup - none
      { data: null, error: null },   // upsert
    ]);
    const res = await request(app).post('/messages/m1/react').send({ userEmail: 'p@x.com', emoji: '👍' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  test('tapping the same emoji again removes the reaction', async () => {
    mockSb.setTable('message_reactions', { data: { id: 'r1', emoji: '👍' }, error: null });
    const res = await request(app).post('/messages/m1/react').send({ userEmail: 'p@x.com', emoji: '👍' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, removed: true });
  });
});

describe('POST /messages (send)', () => {
  test('requires senderEmail, recipientEmail, and content or attachment', async () => {
    const res = await request(app).post('/messages').send({ senderEmail: 'p@x.com', recipientEmail: 't@x.com' });
    expect(res.status).toBe(400);
  });

  test('sends a plain text message', async () => {
    mockSb.setTable('messages', { data: { id: 'm1', content: 'hi' }, error: null });
    const res = await request(app).post('/messages').send({
      senderEmail: 'p@x.com', senderName: 'Parent', recipientEmail: 't@x.com', content: 'hi',
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: 'm1', content: 'hi' });
  });

  test('an attachment gets JSON-encoded into content', async () => {
    let inserted;
    mockSb.supabase.from.mockImplementationOnce((table) => {
      const chain = {
        insert: jest.fn((row) => { inserted = row; return chain; }),
        select: jest.fn(() => chain),
        single: jest.fn(() => Promise.resolve({ data: { id: 'm1', ...inserted }, error: null })),
      };
      return chain;
    });
    const res = await request(app).post('/messages').send({
      senderEmail: 'p@x.com', recipientEmail: 't@x.com', content: 'see attached',
      attachmentUrl: 'http://x/f.png', attachmentName: 'f.png', attachmentSize: 10, attachmentType: 'image/png',
    });
    expect(res.status).toBe(200);
    expect(JSON.parse(inserted.content)).toEqual({
      text: 'see attached',
      attachment: { url: 'http://x/f.png', name: 'f.png', size: 10, type: 'image/png' },
    });
  });
});

describe('GET /messages/conversations', () => {
  test('requires userEmail', async () => {
    const res = await request(app).get('/messages/conversations');
    expect(res.status).toBe(400);
  });

  test('groups messages into threads and counts unread', async () => {
    mockSb.setTable('messages', {
      data: [
        { sender_email: 't@x.com', recipient_email: 'p@x.com', sender_name: 'Teacher', content: 'hi', created_at: '2026-01-02', read_at: null },
        { sender_email: 'p@x.com', recipient_email: 't@x.com', recipient_name: 'Teacher', content: 'hey', created_at: '2026-01-01', read_at: '2026-01-01' },
      ],
      error: null,
    });
    mockSb.setTable('users', { data: [{ email: 't@x.com', role: 'teacher', name: 'Ms Teacher' }], error: null });

    const res = await request(app).get('/messages/conversations?userEmail=p@x.com&role=parent');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([expect.objectContaining({
      otherEmail: 't@x.com', otherName: 'Ms Teacher', otherRole: 'teacher', unreadCount: 1,
    })]);
  });

  test('a parent never sees a non-staff (e.g. parent-to-parent) thread', async () => {
    mockSb.setTable('messages', {
      data: [{ sender_email: 'p2@x.com', recipient_email: 'p@x.com', sender_name: 'Other Parent', content: 'hi', created_at: '2026-01-01', read_at: null }],
      error: null,
    });
    mockSb.setTable('users', { data: [{ email: 'p2@x.com', role: 'parent', name: 'Other Parent' }], error: null });

    const res = await request(app).get('/messages/conversations?userEmail=p@x.com&role=parent');
    expect(res.body).toEqual([]);
  });

  // Regression: a parent's conversation with a staff member whose live DB
  // role is 'school_admin' (not literally 'teacher') was silently dropped
  // from the conversation list — the thread/contacts still worked, so the
  // conversation was only reachable by re-picking that contact via "New".
  test('a parent sees a thread with a school_admin, not just literal teachers', async () => {
    mockSb.setTable('messages', {
      data: [{ sender_email: 'admin@x.com', recipient_email: 'p@x.com', sender_name: 'Principal', content: 'hi', created_at: '2026-01-01', read_at: null }],
      error: null,
    });
    mockSb.setTable('users', { data: [{ email: 'admin@x.com', role: 'school_admin', name: 'Principal' }], error: null });

    const res = await request(app).get('/messages/conversations?userEmail=p@x.com&role=parent');
    expect(res.body).toEqual([expect.objectContaining({ otherEmail: 'admin@x.com', otherRole: 'school_admin' })]);
  });
});

describe('GET /messages/thread', () => {
  test('requires both emails', async () => {
    const res = await request(app).get('/messages/thread?userEmail=p@x.com');
    expect(res.status).toBe(400);
  });

  test('returns messages with resolved reply-quotes and reactions', async () => {
    mockSb.setTable('messages', [
      { data: [{ id: 'm2', reply_to_id: 'm1', content: 'sure' }], error: null },
      { data: [{ id: 'm1', content: 'original', sender_name: 'Teacher', sender_email: 't@x.com' }], error: null },
    ]);
    mockSb.setTable('message_reactions', { data: [{ message_id: 'm2', user_email: 'p@x.com', emoji: '👍' }], error: null });

    const res = await request(app).get('/messages/thread?userEmail=p@x.com&otherEmail=t@x.com');
    expect(res.status).toBe(200);
    expect(res.body[0]).toEqual(expect.objectContaining({
      id: 'm2',
      reply_to: { id: 'm1', senderName: 'Teacher', content: 'original' },
      reactions: { '👍': 1 },
      myReaction: '👍',
    }));
  });
});

describe('GET /messages/contacts', () => {
  test('requires userEmail', async () => {
    const res = await request(app).get('/messages/contacts');
    expect(res.status).toBe(400);
  });

  test('404s (User not found) for an unknown email', async () => {
    mockSb.setTable('users', { data: null, error: null });
    const res = await request(app).get('/messages/contacts?userEmail=ghost@x.com');
    expect(res.status).toBe(404);
  });

  test('a parent with no linked children gets an empty contact list', async () => {
    mockSb.setTable('users', { data: { id: 'p1', role: 'parent' }, error: null });
    mockSb.setTable('parent_children', { data: [], error: null });
    const res = await request(app).get('/messages/contacts?userEmail=p@x.com');
    expect(res.body).toEqual([]);
  });

  test('a parent sees the teacher(s) of their linked children', async () => {
    mockSb.setTable('users', [
      { data: { id: 'p1', role: 'parent' }, error: null },
      { data: [{ id: 't1', name: 'Ms Teacher', email: 't@x.com' }], error: null },
    ]);
    mockSb.setTable('parent_children', { data: [{ child_id: 'c1', users: { id: 'c1', name: 'Kiddo' } }], error: null });
    mockSb.setTable('teacher_student', { data: [{ teacher_id: 't1', student_id: 'c1' }], error: null });

    const res = await request(app).get('/messages/contacts?userEmail=p@x.com');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([expect.objectContaining({ email: 't@x.com', role: 'teacher', context: 'Teacher of Kiddo' })]);
  });

  test('a teacher sees parents of their students plus colleague staff', async () => {
    mockSb.setTable('users', [
      { data: { id: 't1', role: 'teacher', school_id: 'sch1' }, error: null },
      { data: [{ id: 'c1', name: 'Kiddo' }], error: null },
      { data: [{ id: 'p1', name: 'Parent', email: 'p@x.com' }], error: null },
      { data: [{ id: 't2', name: 'Colleague', email: 't2@x.com', role: 'teacher' }], error: null },
    ]);
    mockSb.setTable('teacher_student', { data: [{ student_id: 'c1' }], error: null });
    mockSb.setTable('parent_children', { data: [{ parent_email: 'p@x.com', child_id: 'c1' }], error: null });

    const res = await request(app).get('/messages/contacts?userEmail=t@x.com');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(expect.arrayContaining([
      expect.objectContaining({ email: 'p@x.com', role: 'parent', context: 'Parent of Kiddo' }),
      expect.objectContaining({ email: 't2@x.com', context: 'Teacher' }),
    ]));
  });

  test('a school admin sees the rest of the school staff', async () => {
    mockSb.setTable('users', [
      { data: { id: 'a1', role: 'school_admin', school_id: 'sch1' }, error: null },
      { data: [{ id: 't1', name: 'Ms Teacher', email: 't@x.com', role: 'teacher' }], error: null },
    ]);
    const res = await request(app).get('/messages/contacts?userEmail=admin@x.com');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([expect.objectContaining({ email: 't@x.com', context: 'Teacher' })]);
  });

  test('a student sees their linked parent(s)', async () => {
    mockSb.setTable('users', [
      { data: { id: 's1', role: 'student' }, error: null },
      { data: [{ id: 'p1', name: 'Parent', email: 'p@x.com' }], error: null },
    ]);
    mockSb.setTable('parent_children', { data: [{ parent_email: 'p@x.com' }], error: null });
    const res = await request(app).get('/messages/contacts?userEmail=student@x.com');
    expect(res.body).toEqual([expect.objectContaining({ email: 'p@x.com', role: 'parent', context: 'Your parent' })]);
  });
});

describe('POST /messages/upload', () => {
  test('400s with no file', async () => {
    const res = await request(app).post('/messages/upload');
    expect(res.status).toBe(400);
  });

  test('uploads to Cloudinary and returns url/name/size/type', async () => {
    cloudinary.uploader.upload.mockResolvedValue({ secure_url: 'https://cdn/x.png' });
    const res = await request(app)
      .post('/messages/upload')
      .attach('file', Buffer.from('fake image bytes'), { filename: 'photo.png', contentType: 'image/png' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual(expect.objectContaining({ url: 'https://cdn/x.png', name: 'photo.png', type: 'png' }));
  });

  test('a Cloudinary failure returns a friendly 500', async () => {
    cloudinary.uploader.upload.mockRejectedValue(new Error('cloudinary down'));
    const res = await request(app)
      .post('/messages/upload')
      .attach('file', Buffer.from('fake'), { filename: 'photo.png', contentType: 'image/png' });
    expect(res.status).toBe(500);
  });
});

describe('POST /messages/aivorah-reply', () => {
  test('requires parentEmail and message', async () => {
    const res = await request(app).post('/messages/aivorah-reply').send({});
    expect(res.status).toBe(400);
  });

  test('gets an AI reply and stores it as a message from Aivorah', async () => {
    let inserted;
    mockSb.supabase.from.mockImplementationOnce((table) => ({
      insert: jest.fn((row) => { inserted = row; return Promise.resolve({ data: null, error: null }); }),
    }));
    const res = await request(app).post('/messages/aivorah-reply').send({
      parentEmail: 'p@x.com', parentName: 'Parent', message: 'How do I message the teacher?', role: 'parent',
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ reply: 'AI reply text' });
    expect(inserted).toEqual(expect.objectContaining({
      sender_email: 'system@aivorah.com', recipient_email: 'p@x.com', content: 'AI reply text',
    }));
  });
});

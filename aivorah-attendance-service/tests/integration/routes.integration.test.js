// Real routes + auth middleware through Supertest; Firebase, the users lookup, the grades view and the
// attendance store are mocked at the module boundary.

const USERS = {
  att: { id: 't1', role: 'teacher', school_id: 's1', email: 'att@s1.org', name: 'Ms Att' },
  other: { id: 't2', role: 'teacher', school_id: 's1', email: 'other@s1.org' },
  admin: { id: 'a1', role: 'school_admin', school_id: 's1', email: 'admin@s1.org' },
  parent: { id: 'p1', role: 'parent', school_id: 's1', email: 'parent@s1.org' },
  stranger: { id: 'p2', role: 'parent', school_id: 's1', email: 'stranger@s1.org' },
  kid: { id: 'k1', role: 'student', school_id: 's1', email: 'kid@s1.org', grade: 'Grade 5', section: 'E2E-ATT' },
  noschool: { id: 't3', role: 'teacher', school_id: null, email: 'free@x.org' },
};

jest.mock('../../services/firebaseAdmin', () => ({
  auth: () => ({
    verifyIdToken: jest.fn(async (token) => {
      if (token === 'bad') throw new Error('invalid');
      if (token === 'ghost') return { email: 'nobody@x.org' };
      return { email: `${token}@token` };
    }),
  }),
}));

jest.mock('../../services/supabase', () => {
  const chain = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn(function (_c, v) { this._email = v; return this; }),
    maybeSingle: jest.fn(),
  };
  return { from: jest.fn(() => chain), _chain: chain };
});

jest.mock('../../services/academicStructure', () => ({
  buildGradesSectionsView: jest.fn(async () => [
    { name: 'Grade 5', sections: [
      { name: 'E2E-ATT', classTeacherEmail: 'att@s1.org', studentCount: 2 },
      { name: 'E2E-ATT-B', classTeacherEmail: 'other@s1.org', studentCount: 1 },
    ] },
  ]),
}));

jest.mock('../../services/attendanceStore', () => ({
  roster: jest.fn(),
  recordsFor: jest.fn(async () => []),
  upsertRecords: jest.fn(async () => {}),
  studentHistory: jest.fn(async () => []),
  getStudent: jest.fn(),
  isParentOf: jest.fn(async () => false),
  childrenOf: jest.fn(async () => []),
}));

const request = require('supertest');
const supabase = require('../../services/supabase');
const store = require('../../services/attendanceStore');
const app = require('../../index');

const as = (key) => ({ Authorization: `Bearer ${key}` });
const ROSTER = [
  { id: 'k1', name: 'Kid One', email: 'kid@s1.org', photo_url: null },
  { id: 'k2', name: 'Kid Two', email: 'kid2@s1.org', photo_url: 'p.png' },
];

beforeEach(() => {
  jest.clearAllMocks();
  supabase._chain.maybeSingle.mockImplementation(async function () {
    const key = String(this._email).replace('@token', '');
    return { data: USERS[key] || null, error: null };
  });
  store.roster.mockImplementation(async (_s, _g, section) => (section === 'E2E-ATT' ? ROSTER : [{ id: 'b1', name: 'B', email: 'b@s1.org' }]));
  store.getStudent.mockImplementation(async (id) => (id === 'k1' ? { ...USERS.kid } : null));
});

describe('sign-in', () => {
  test('401 with no token', async () => expect((await request(app).get('/classes/mine')).status).toBe(401));
  test('401 with a bad token', async () => expect((await request(app).get('/classes/mine').set(as('bad'))).status).toBe(401));
  test('403 when the sign-in has no Aivorah account', async () => expect((await request(app).get('/classes/mine').set(as('ghost'))).status).toBe(403));
  test('health needs no sign-in', async () => expect((await request(app).get('/health')).body.status).toBe('ok'));
});

describe('GET /classes/mine', () => {
  test('class teacher sees only their class', async () => {
    const res = await request(app).get('/classes/mine').set(as('att'));
    expect(res.status).toBe(200);
    expect(res.body.classes).toEqual([expect.objectContaining({ grade: 'Grade 5', section: 'E2E-ATT', studentCount: 2 })]);
  });
  test('a teacher with no class gets an empty list', async () => {
    const res = await request(app).get('/classes/mine').set(as('admin'));
    expect(res.body).toEqual({ classes: [] });
  });
  test('a teacher with no school gets an empty list', async () => {
    expect((await request(app).get('/classes/mine').set(as('noschool'))).body).toEqual({ classes: [] });
  });
  test("parent: one homeroom card per linked child (not deduped by class — MyClassesScreen shows one card per child)", async () => {
    store.childrenOf.mockResolvedValueOnce([
      { id: 'c1', name: 'Kid One', grade: 'Grade 5', section: 'E2E-ATT', school_id: 's1' },
      { id: 'c2', name: 'Kid Two', grade: 'Grade 5', section: 'E2E-ATT', school_id: 's1' },
      { id: 'c3', name: 'Elsewhere', grade: 'Grade 2', section: 'A', school_id: 'other' },
    ]);
    const res = await request(app).get('/classes/mine').set(as('parent'));
    expect(res.body.classes).toEqual([
      expect.objectContaining({ grade: 'Grade 5', section: 'E2E-ATT', code: 'Grade 5E2E-ATT', studentId: 'c1', studentName: 'Kid One' }),
      expect.objectContaining({ grade: 'Grade 5', section: 'E2E-ATT', code: 'Grade 5E2E-ATT', studentId: 'c2', studentName: 'Kid Two' }),
    ]);
  });
  test('student: own class, as a full homeroom card (classTeacherEmail, code, studentCount)', async () => {
    const classes = (await request(app).get('/classes/mine').set(as('kid'))).body.classes;
    expect(classes).toEqual([
      expect.objectContaining({ grade: 'Grade 5', section: 'E2E-ATT', label: 'Grade 5 Homeroom', code: 'Grade 5E2E-ATT', classTeacherEmail: 'att@s1.org', studentCount: 2 }),
    ]);
  });
});

describe('GET /attendance/class', () => {
  const q = { grade: 'Grade 5', section: 'E2E-ATT', date: '2026-09-02' };
  test('class teacher gets exactly the roster with each status', async () => {
    store.recordsFor.mockResolvedValueOnce([{ student_id: 'k1', status: 'absent' }]);
    const res = await request(app).get('/attendance/class').query(q).set(as('att'));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ date: '2026-09-02', students: [
      { id: 'k1', name: 'Kid One', email: 'kid@s1.org', photoUrl: null, status: 'absent' },
      { id: 'k2', name: 'Kid Two', email: 'kid2@s1.org', photoUrl: 'p.png', status: null },
    ] });
    expect(store.roster).toHaveBeenCalledWith('s1', 'Grade 5', 'E2E-ATT');
  });
  test('another teacher: 403', async () => expect((await request(app).get('/attendance/class').query(q).set(as('other'))).status).toBe(403));
  test('parent: 403', async () => expect((await request(app).get('/attendance/class').query(q).set(as('parent'))).status).toBe(403));
  test('school admin: allowed', async () => expect((await request(app).get('/attendance/class').query(q).set(as('admin'))).status).toBe(200));
  test.each([{ ...q, date: '02-09-2026' }, { ...q, section: '' }, { grade: 'Grade 5', section: 'E2E-ATT' }])('400 on %o', async (bad) => {
    expect((await request(app).get('/attendance/class').query(bad).set(as('att'))).status).toBe(400);
  });
  test('500 when the database fails', async () => {
    store.roster.mockRejectedValueOnce(new Error('db down'));
    expect((await request(app).get('/attendance/class').query(q).set(as('att'))).status).toBe(500);
  });
});

describe('POST /attendance/save', () => {
  const body = { date: '2026-09-02', grade: 'Grade 5', section: 'E2E-ATT', records: { k1: 'absent', k2: 'late' } };
  test('class teacher saves; rows carry class and who marked', async () => {
    const res = await request(app).post('/attendance/save').send(body).set(as('att'));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, date: '2026-09-02', saved: 2 });
    const rows = store.upsertRecords.mock.calls[0][0];
    expect(rows).toEqual([
      expect.objectContaining({ student_id: 'k1', date: '2026-09-02', status: 'absent', school_id: 's1', grade: 'Grade 5', section: 'E2E-ATT', marked_by: 't1', marked_by_email: 'att@s1.org' }),
      expect.objectContaining({ student_id: 'k2', status: 'late' }),
    ]);
  });
  test('another teacher: 403, nothing saved', async () => {
    expect((await request(app).post('/attendance/save').send(body).set(as('other'))).status).toBe(403);
    expect(store.upsertRecords).not.toHaveBeenCalled();
  });
  test('a student from another class: 400, nothing saved', async () => {
    const res = await request(app).post('/attendance/save').send({ ...body, records: { k1: 'present', b1: 'present' } }).set(as('att'));
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not in this class/);
    expect(store.upsertRecords).not.toHaveBeenCalled();
  });
  test.each([
    ['bad status', { ...body, records: { k1: 'here' } }],
    ['no records', { ...body, records: undefined }],
    ['bad date', { ...body, date: '2026-02-30' }],
    ['no grade', { ...body, grade: undefined }],
  ])('400: %s', async (_n, bad) => {
    expect((await request(app).post('/attendance/save').send(bad).set(as('att'))).status).toBe(400);
    expect(store.upsertRecords).not.toHaveBeenCalled();
  });
  test('401 without sign-in', async () => expect((await request(app).post('/attendance/save').send(body)).status).toBe(401));
});

describe('GET /attendance/student/:id/summary', () => {
  const rows = [{ date: '2026-09-03', status: 'late' }, { date: '2026-09-02', status: 'absent' }, { date: '2026-09-01', status: 'present' }];
  test("parent of the child: counts, the monolith's rate, history newest first", async () => {
    store.isParentOf.mockResolvedValueOnce(true);
    store.studentHistory.mockResolvedValueOnce(rows);
    const res = await request(app).get('/attendance/student/k1/summary').set(as('parent'));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      studentId: 'k1',
      summary: { present: 1, absent: 1, late: 1, total: 3, ratePct: 50 },
      history: [{ date: '2026-09-03', status: 'late' }, { date: '2026-09-02', status: 'absent' }, { date: '2026-09-01', status: 'present' }],
    });
    expect(store.isParentOf).toHaveBeenCalledWith('parent@s1.org', 'k1');
  });
  test('no records: rate null, not 100', async () => {
    store.isParentOf.mockResolvedValueOnce(true);
    const res = await request(app).get('/attendance/student/k1/summary').set(as('parent'));
    expect(res.body.summary.ratePct).toBeNull();
    expect(res.body.history).toEqual([]);
  });
  test('another parent: 403', async () => expect((await request(app).get('/attendance/student/k1/summary').set(as('stranger'))).status).toBe(403));
  test('the student themself: allowed', async () => expect((await request(app).get('/attendance/student/k1/summary').set(as('kid'))).status).toBe(200));
  test('their class teacher: allowed; another teacher: 403', async () => {
    expect((await request(app).get('/attendance/student/k1/summary').set(as('att'))).status).toBe(200);
    expect((await request(app).get('/attendance/student/k1/summary').set(as('other'))).status).toBe(403);
  });
  test('unknown student: 404', async () => expect((await request(app).get('/attendance/student/nope/summary').set(as('parent'))).status).toBe(404));
});

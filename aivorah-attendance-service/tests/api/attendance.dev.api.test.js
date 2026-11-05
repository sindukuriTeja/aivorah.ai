// Real Supabase (Dev project ONLY) through the real routes; only Firebase token checks are faked.
// Runs only with ATTENDANCE_API_TESTS=1 and ATTENDANCE_API_ENV=<path to an env file with the Dev
// SUPABASE_URL/SUPABASE_SERVICE_KEY>. Seeds its own school/users and deletes them afterwards.
const DEV_REF = 'evlqkcozespsfrnuhevf';
const enabled = process.env.ATTENDANCE_API_TESTS === '1';
if (enabled) {
  require('dotenv').config({ path: process.env.ATTENDANCE_API_ENV, override: true });
  if (!String(process.env.SUPABASE_URL || '').includes(DEV_REF)) throw new Error(`API tests only run against the Dev project (${DEV_REF})`);
}

jest.mock('../../services/firebaseAdmin', () => ({
  auth: () => ({ verifyIdToken: async (token) => ({ email: token }) }),
}));

const run = enabled ? describe : describe.skip;
jest.setTimeout(60000);

run('attendance API against the Dev database', () => {
  // Loaded lazily: a skipped describe still runs this body, and there is no DB config then.
  const request = require('supertest');
  let supabase;
  let app;

  const tag = `api${Date.now()}`;
  const email = (who) => `${tag}.${who}@aivorah.test`;
  const as = (who) => ({ Authorization: `Bearer ${email(who)}` });
  const ids = {};
  let schoolId;

  beforeAll(async () => {
    supabase = require('../../services/supabase');
    app = require('../../index');
    const { data: school, error } = await supabase.from('schools').insert({
      name: `API Test School ${tag}`,
      academic_structure: { grades: [{ name: 'Grade 5', sections: [
        { name: 'E2E-ATT', classTeacherEmail: email('teacher') },
        { name: 'E2E-ATT-B', classTeacherEmail: email('teacherb') },
      ] }] },
    }).select('id').single();
    if (error) throw error;
    schoolId = school.id;
    const people = [
      ['teacher', { role: 'teacher' }], ['teacherb', { role: 'teacher' }], ['lonely', { role: 'teacher' }],
      ['s1', { role: 'student', grade: 'Grade 5', section: 'E2E-ATT' }], ['s2', { role: 'student', grade: 'Grade 5', section: 'E2E-ATT' }],
      ['b1', { role: 'student', grade: 'Grade 5', section: 'E2E-ATT-B' }],
      ['parent', { role: 'parent' }], ['otherparent', { role: 'parent' }],
    ];
    const { data: rows, error: uErr } = await supabase.from('users')
      .insert(people.map(([who, extra]) => ({ name: `${tag} ${who}`, email: email(who), school_id: schoolId, ...extra })))
      .select('id, email');
    if (uErr) throw uErr;
    for (const r of rows) ids[r.email.split('.')[1].split('@')[0]] = r.id;
    const { error: pErr } = await supabase.from('parent_children').insert({ parent_email: email('parent'), child_id: ids.s1 });
    if (pErr) throw pErr;
  }, 60000);

  afterAll(async () => {
    const all = Object.values(ids);
    if (all.length) {
      await supabase.from('attendance_records').delete().in('student_id', all);
      await supabase.from('parent_children').delete().eq('parent_email', email('parent'));
      await supabase.from('users').delete().in('id', all);
    }
    if (schoolId) await supabase.from('schools').delete().eq('id', schoolId);
  }, 60000);

  test('class teacher sees exactly their class; another teacher is refused', async () => {
    const res = await request(app).get('/attendance/class').query({ grade: 'Grade 5', section: 'E2E-ATT', date: '2026-09-02' }).set(as('teacher'));
    expect(res.status).toBe(200);
    expect(res.body.students.map((s) => s.id).sort()).toEqual([ids.s1, ids.s2].sort());
    expect(res.body.students.every((s) => s.status === null)).toBe(true);
    expect((await request(app).get('/attendance/class').query({ grade: 'Grade 5', section: 'E2E-ATT', date: '2026-09-02' }).set(as('teacherb'))).status).toBe(403);
  });

  test('classes/mine: own class for the class teacher, empty for a teacher with none', async () => {
    const mine = await request(app).get('/classes/mine').set(as('teacher'));
    expect(mine.body.classes).toEqual([expect.objectContaining({ grade: 'Grade 5', section: 'E2E-ATT', studentCount: 2 })]);
    expect((await request(app).get('/classes/mine').set(as('lonely'))).body).toEqual({ classes: [] });
  });

  test('save, re-save the same day (upsert), and a student from another class is rejected', async () => {
    const save = (records, date) => request(app).post('/attendance/save').send({ date, grade: 'Grade 5', section: 'E2E-ATT', records }).set(as('teacher'));
    expect((await save({ [ids.s1]: 'present' }, '2026-09-01')).status).toBe(200);
    expect((await save({ [ids.s1]: 'present' }, '2026-09-02')).status).toBe(200);
    expect((await save({ [ids.s1]: 'absent', [ids.s2]: 'present' }, '2026-09-02')).status).toBe(200);
    expect((await save({ [ids.s1]: 'late' }, '2026-09-03')).status).toBe(200);
    expect((await save({ [ids.b1]: 'present' }, '2026-09-03')).status).toBe(400);

    const day = await request(app).get('/attendance/class').query({ grade: 'Grade 5', section: 'E2E-ATT', date: '2026-09-02' }).set(as('teacher'));
    const byId = Object.fromEntries(day.body.students.map((s) => [s.id, s.status]));
    expect(byId).toEqual({ [ids.s1]: 'absent', [ids.s2]: 'present' });
    const { data: rows } = await supabase.from('attendance_records').select('date').eq('student_id', ids.s1);
    expect(rows).toHaveLength(3);
  });

  test("the child's parent gets counts, rate and history; another parent is refused", async () => {
    const res = await request(app).get(`/attendance/student/${ids.s1}/summary`).set(as('parent'));
    expect(res.status).toBe(200);
    expect(res.body.summary).toEqual({ present: 1, absent: 1, late: 1, total: 3, ratePct: 50 });
    expect(res.body.history).toEqual([
      { date: '2026-09-03', status: 'late' }, { date: '2026-09-02', status: 'absent' }, { date: '2026-09-01', status: 'present' },
    ]);
    expect((await request(app).get(`/attendance/student/${ids.s1}/summary`).set(as('otherparent'))).status).toBe(403);
  });

  test('a student with no records has no rate (null), not 100%', async () => {
    const res = await request(app).get(`/attendance/student/${ids.b1}/summary`).set(as('teacherb'));
    expect(res.status).toBe(200);
    expect(res.body.summary).toEqual({ present: 0, absent: 0, late: 0, total: 0, ratePct: null });
  });
});

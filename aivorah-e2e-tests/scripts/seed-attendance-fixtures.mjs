// One-time, idempotent setup of the Attendance E2E fixtures in the E2E Supabase project
// (school "E2E School Mutate", owned by admin-b). Safe to re-run.
//   - teachers/parents: Firebase sign-up (the app's normal email/password login) + users row
//   - students: users row only (they never log in in these specs)
//   - Grade 5 sections E2E-ATT (class teacher teacher-att) and E2E-ATT-B (teacher-att-b)
//   - parent_children links
// Usage: node scripts/seed-attendance-fixtures.mjs   (prints the E2E_* lines to add to .env)
// After a first run, mark the 5 logins email-verified (the app blocks unverified logins) with the
// Firebase Admin SDK from aivorah-auth-service (firebase-service-account.json): updateUser(uid, { emailVerified: true }).

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '..', '.env'), quiet: true });

const SCHOOL = 'E2E School Mutate';
const GRADE = 'Grade 5';
const SECTION_A = 'E2E-ATT';
const SECTION_B = 'E2E-ATT-B';
const PASSWORD = process.env.E2E_PASSWORD;
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// The app's public Firebase web key (same one the login page uses).
const firebaseCfg = fs.readFileSync(path.resolve(__dirname, '..', '..', 'aivorah-frontend', 'src', 'config', 'firebase.ts'), 'utf8');
const FIREBASE_KEY = (firebaseCfg.match(/apiKey:\s*['"]([^'"]+)['"]/) || [])[1];

export const ATTENDANCE_FIXTURES = {
  'teacher-att': { env: 'E2E_TEACHER_ATT', email: 'e2e.teacher.att@aivorah.test', name: 'E2E Teacher Att', role: 'teacher', login: true },
  'teacher-att-b': { env: 'E2E_TEACHER_ATT_B', email: 'e2e.teacher.att.b@aivorah.test', name: 'E2E Teacher Att B', role: 'teacher', login: true },
  'teacher-att-none': { env: 'E2E_TEACHER_ATT_NONE', email: 'e2e.teacher.att.none@aivorah.test', name: 'E2E Teacher Att None', role: 'teacher', login: true },
  'parent-att': { env: 'E2E_PARENT_ATT', email: 'e2e.parent.att@aivorah.test', name: 'E2E Parent Att', role: 'parent', login: true },
  'parent-att-dash': { env: 'E2E_PARENT_ATT_DASH', email: 'e2e.parent.att.dash@aivorah.test', name: 'E2E Parent Att Dash', role: 'parent', login: true },
  'student-att-1': { env: 'E2E_STUDENT_ATT_1', email: 'e2e.student.att.1@aivorah.test', name: 'Att Student One', role: 'student', section: SECTION_A },
  'student-att-2': { env: 'E2E_STUDENT_ATT_2', email: 'e2e.student.att.2@aivorah.test', name: 'Att Student Two', role: 'student', section: SECTION_A },
  'student-att-3': { env: 'E2E_STUDENT_ATT_3', email: 'e2e.student.att.3@aivorah.test', name: 'Att Student Three', role: 'student', section: SECTION_A },
  'student-att-t1': { env: 'E2E_STUDENT_ATT_T1', email: 'e2e.student.att.t1@aivorah.test', name: 'Att Teacher Pick One', role: 'student', section: SECTION_A },
  'student-att-t2': { env: 'E2E_STUDENT_ATT_T2', email: 'e2e.student.att.t2@aivorah.test', name: 'Att Teacher Pick Two', role: 'student', section: SECTION_A },
  'student-att-b1': { env: 'E2E_STUDENT_ATT_B1', email: 'e2e.student.att.b1@aivorah.test', name: 'Att Other Class', role: 'student', section: SECTION_B },
};
const LINKS = [['parent-att', 'student-att-1'], ['parent-att', 'student-att-2'], ['parent-att-dash', 'student-att-3']];

async function firebaseSignUp(email) {
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FIREBASE_KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD, returnSecureToken: false }),
  });
  if (r.ok) return 'created';
  const err = (await r.json().catch(() => ({})))?.error?.message || r.status;
  if (err === 'EMAIL_EXISTS') return 'exists';
  throw new Error(`Firebase sign-up ${email}: ${err}`);
}

async function main() {
  if (!PASSWORD || !FIREBASE_KEY) throw new Error('E2E_PASSWORD or the Firebase web key is missing');
  const { data: school, error: se } = await sb.from('schools').select('id, academic_structure').eq('name', SCHOOL).single();
  if (se) throw se;

  const ids = {};
  for (const [key, a] of Object.entries(ATTENDANCE_FIXTURES)) {
    const auth = a.login ? await firebaseSignUp(a.email) : 'no login';
    const row = {
      email: a.email, name: a.name, role: a.role, school: SCHOOL, school_id: school.id, status: 'active',
      onboarding_complete: true, grade: a.role === 'student' ? GRADE : null, section: a.section || null,
      curriculum: a.role === 'student' ? 'CBSE' : null,
    };
    const { data: existing } = await sb.from('users').select('id').eq('email', a.email).maybeSingle();
    const q = existing ? sb.from('users').update(row).eq('id', existing.id).select('id').single() : sb.from('users').insert(row).select('id').single();
    const { data, error } = await q;
    if (error) throw new Error(`${key}: ${error.message}`);
    ids[key] = data.id;
    console.log(`${key.padEnd(17)} ${auth.padEnd(8)} users:${existing ? 'updated' : 'created'}`);
  }

  for (const [parent, child] of LINKS) {
    const parentEmail = ATTENDANCE_FIXTURES[parent].email;
    const { data: link } = await sb.from('parent_children').select('id').eq('parent_email', parentEmail).eq('child_id', ids[child]).maybeSingle();
    if (!link) {
      const { error } = await sb.from('parent_children').insert({ parent_email: parentEmail, child_id: ids[child] });
      if (error) throw new Error(`link ${parent}->${child}: ${error.message}`);
    }
  }

  // Merge the two sections into the school's structure without touching anything else in it.
  const structure = school.academic_structure && typeof school.academic_structure === 'object' ? school.academic_structure : {};
  const grades = Array.isArray(structure.grades) ? [...structure.grades] : [];
  let g5 = grades.find((g) => g.name === GRADE);
  if (!g5) { g5 = { name: GRADE, archived: false, sections: [] }; grades.push(g5); }
  g5.sections = Array.isArray(g5.sections) ? g5.sections : [];
  for (const [name, teacher] of [[SECTION_A, 'teacher-att'], [SECTION_B, 'teacher-att-b']]) {
    const sec = g5.sections.find((s) => s.name === name);
    if (sec) Object.assign(sec, { archived: false, classTeacherEmail: ATTENDANCE_FIXTURES[teacher].email });
    else g5.sections.push({ name, archived: false, classTeacherEmail: ATTENDANCE_FIXTURES[teacher].email });
  }
  const { error: ue } = await sb.from('schools').update({ academic_structure: { ...structure, grades } }).eq('id', school.id);
  if (ue) throw ue;
  console.log(`${SCHOOL}: ${GRADE} sections ${SECTION_A} (teacher-att), ${SECTION_B} (teacher-att-b); ${LINKS.length} parent links`);

  console.log('\n# add to .env');
  for (const a of Object.values(ATTENDANCE_FIXTURES)) console.log(`${a.env}=${a.email}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e.message || e); process.exit(1); });

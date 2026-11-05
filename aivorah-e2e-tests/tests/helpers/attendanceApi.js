// Test-data SETUP for the Attendance specs only (never used as an assertion).
// Marks attendance the way a class teacher would, through aivorah-attendance-service,
// so a parent/teacher spec starts from a known state.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { accountFor, PASSWORD } from './accounts.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ATTENDANCE_URL = process.env.ATTENDANCE_SERVICE_URL || 'https://aivorah-attendance-service-y3t6.onrender.com';
export const GRADE = 'Grade 5';
export const SECTION_A = 'E2E-ATT';
export const SECTION_B = 'E2E-ATT-B';

// The app's public Firebase web key (the login page's own key).
const firebaseCfg = fs.readFileSync(path.resolve(__dirname, '..', '..', '..', 'aivorah-frontend', 'src', 'config', 'firebase.ts'), 'utf8');
const FIREBASE_KEY = (firebaseCfg.match(/apiKey:\s*['"]([^'"]+)['"]/) || [])[1];

const tokens = new Map();
export async function idToken(request, account) {
  if (tokens.has(account)) return tokens.get(account);
  const res = await request.post(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_KEY}`, {
    data: { email: accountFor(account).email, password: PASSWORD, returnSecureToken: true },
  });
  if (!res.ok()) throw new Error(`sign-in failed for ${account}: ${res.status()}`);
  const token = (await res.json()).idToken;
  tokens.set(account, token);
  return token;
}

// Student ids for the fixtures, looked up by the teacher's own roster (setup only).
export async function rosterIds(request, { account = 'teacher-att', section = SECTION_A, date }) {
  const token = await idToken(request, account);
  const res = await request.get(`${ATTENDANCE_URL}/attendance/class`, {
    params: { grade: GRADE, section, date },
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok()) throw new Error(`roster lookup failed: ${res.status()}`);
  const { students } = await res.json();
  return Object.fromEntries(students.map((s) => [s.email, s.id]));
}

export async function markAttendance(request, { account = 'teacher-att', section = SECTION_A, date, records }) {
  const token = await idToken(request, account);
  const res = await request.post(`${ATTENDANCE_URL}/attendance/save`, {
    data: { date, grade: GRADE, section, records },
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok()) throw new Error(`setup mark failed: ${res.status()} ${await res.text()}`);
}

export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Attendance students never log in, so they are not in accounts.js (global setup logs those in).
const STUDENT_ENV = {
  'student-att-1': 'E2E_STUDENT_ATT_1', 'student-att-2': 'E2E_STUDENT_ATT_2', 'student-att-3': 'E2E_STUDENT_ATT_3',
  'student-att-t1': 'E2E_STUDENT_ATT_T1', 'student-att-t2': 'E2E_STUDENT_ATT_T2', 'student-att-b1': 'E2E_STUDENT_ATT_B1',
};
export function studentEmail(key) {
  const email = process.env[STUDENT_ENV[key]];
  if (!email) throw new Error(`Unknown attendance student "${key}" (missing ${STUDENT_ENV[key]} in .env)`);
  return email;
}

// Scheduled calendar events → Notification V2 (event_scheduled), student + parent bell.
// Pins the 2026-10-09 fixes: a teacher's class event reaches only that teacher's own
// students (and their parents), and the parent who creates an event isn't notified.
//
// Setup (API, allowed by the persona rule): a teacher or parent creates the event via
// POST /schedule, sending createdBy + creatorEmail exactly like their schedule screens.
// Everything asserted is what the student/parent sees in the bell and where a tap goes.
//
// Accounts: student-notif + parent-notif, the login-less E2E_NOTIF_TEACHER (linked only
// to student-notif), and teacher-d as an unrelated teacher. Each test uses uniquely
// titled events and removes only its own rows.
//
// Needs SCHEDULE_SERVICE_URL pointing at the deployed schedule service.

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { newPageAs } from '../helpers/session.js';
import { accountFor } from '../helpers/accounts.js';
import { applyServiceOverrides } from '../helpers/serviceOverrides.js';
import { dismissAnnouncementIfPresent } from '../helpers/dismissAnnouncement.js';
import { eventDetailModal } from '../helpers/scheduleLocators.js';
import { createScheduleEvent } from '../helpers/api.js';

export const REQUIRED_ACCOUNTS = ['student-notif', 'parent-notif'];

// Setup + login + waiting for the bell's poll exceeds the 30s default.
test.describe.configure({ timeout: 90_000 });

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const STUDENT = accountFor('student-notif');
const PARENT = accountFor('parent-notif');
const TEACHER_EMAIL = process.env.E2E_NOTIF_TEACHER;
const OTHER_TEACHER_EMAIL = accountFor('teacher-d').email;
const STUDENT_NAME = 'Notif Student';

let ids; // { student, otherTeacher }

async function idOf(email) {
  const { data, error } = await db.from('users').select('id').eq('email', email.toLowerCase()).single();
  if (error) throw new Error(`users lookup failed for ${email}: ${error.message}`);
  return data.id;
}

test.beforeAll(async () => {
  ids = { student: await idOf(STUDENT.email), otherTeacher: await idOf(OTHER_TEACHER_EMAIL) };
  // Precondition for the isolation test: teacher-d must not teach student-notif.
  const { data } = await db.from('teacher_student').select('student_id')
    .eq('teacher_id', ids.otherTeacher).eq('student_id', ids.student);
  expect(data, 'teacher-d must not be linked to student-notif').toEqual([]);
});

// ── per-test data, removed afterwards ──
const created = [];

test.afterEach(async () => {
  for (const ev of created.splice(0)) {
    await db.from('notifications').delete().eq('entity_type', 'schedule_event').eq('entity_id', ev.id);
    await db.from('messages').delete().eq('sender_email', 'system@aivorah.com').like('content', `SCHEDULE_CARD|%|${ev.title}|%`);
    await db.from('schedule_events').delete().eq('id', ev.id);
  }
});

// Today (local), so the event is in the week every schedule screen opens on.
function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Title Case words only: the parent schedule renders titles through toTitleCase().
const uniqueTitle = (label) => `Notif ${label} ${Date.now()}`;

async function scheduleEvent(request, { title, studentId, createdBy, creatorEmail }) {
  const ev = await createScheduleEvent(request, {
    title, date: today(), startTime: '10:00', endTime: '11:00', type: 'lesson', studentId, createdBy, creatorEmail,
  });
  created.push({ id: ev.id, title });
  return ev;
}

const teacherClassEvent = (request, title, teacherEmail = TEACHER_EMAIL) =>
  scheduleEvent(request, { title, studentId: 'all', createdBy: 'teacher', creatorEmail: teacherEmail });

async function openAppAs(browser, account) {
  const page = await newPageAs(browser, account);
  await applyServiceOverrides(page.context());
  await page.goto('/');
  await dismissAnnouncementIfPresent(page);
  return page;
}

function bellItems(page) {
  return page.locator('[data-testid^="notif-item-"]');
}

async function openBell(page) {
  await page.getByTestId('header-bell-button').first().click();
}

// The open bell re-renders on every poll, so just wait for the item to show up.
async function bellItemWithText(page, text) {
  const item = bellItems(page).filter({ hasText: text });
  await expect(item.first()).toBeVisible({ timeout: 40000 });
  return item;
}

test('1. teacher schedules a class event → student gets it in the bell → tap opens that event', async ({ browser, request }) => {
  const title = uniqueTitle('Class Event One');
  await teacherClassEvent(request, title);

  const page = await openAppAs(browser, 'student-notif');
  await openBell(page);
  const item = await bellItemWithText(page, `New event: ${title}`);
  await item.first().click();

  await expect(eventDetailModal(page).getByText(title).first()).toBeVisible({ timeout: 20000 });
});

test('2. teacher schedules a class event → parent gets it for the child → tap opens that child’s schedule', async ({ browser, request }) => {
  const title = uniqueTitle('Class Event Two');
  await teacherClassEvent(request, title);

  const page = await openAppAs(browser, 'parent-notif');
  await openBell(page);
  const item = await bellItemWithText(page, `New event for ${STUDENT_NAME}: ${title}`);
  await item.first().click();

  // The parent screen first loads the child list from the deployed students-service.
  const onSchedule = page.getByText(title, { exact: true }).first();
  await onSchedule.scrollIntoViewIfNeeded({ timeout: 45000 });
  await expect(onSchedule).toBeVisible();
});

test('3. another teacher’s class event does not reach a student who isn’t theirs', async ({ browser, request }) => {
  const otherTitle = uniqueTitle('Other Class Event');
  const anchor = uniqueTitle('Own Class Anchor');
  await teacherClassEvent(request, otherTitle, OTHER_TEACHER_EMAIL);
  await teacherClassEvent(request, anchor);

  const page = await openAppAs(browser, 'student-notif');
  await openBell(page);
  // Anchor on the student's own teacher's event, then check the other one is absent.
  await bellItemWithText(page, `New event: ${anchor}`);
  await expect(bellItems(page).filter({ hasText: otherTitle })).toHaveCount(0);
});

test('4. a parent-created event reaches the student, not the parent who created it', async ({ browser, request }) => {
  const parentTitle = uniqueTitle('Parent Event');
  await scheduleEvent(request, { title: parentTitle, studentId: ids.student, createdBy: 'parent', creatorEmail: PARENT.email });

  const student = await openAppAs(browser, 'student-notif');
  await openBell(student);
  await bellItemWithText(student, `New event: ${parentTitle}`);

  // Anchor on a notification the parent should get, then check their own event is absent.
  const anchor = uniqueTitle('Parent Anchor');
  await teacherClassEvent(request, anchor);
  const parent = await openAppAs(browser, 'parent-notif');
  await openBell(parent);
  await bellItemWithText(parent, `New event for ${STUDENT_NAME}: ${anchor}`);
  await expect(bellItems(parent).filter({ hasText: parentTitle })).toHaveCount(0);
});

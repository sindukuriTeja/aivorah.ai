// Notification System V2 — Student + Parent bell, deep links, ordering, read
// state, idempotency (plan tests 1-8; test 9 "due event" ships with the scheduler).
//
// Setup (API, allowed by the persona rule): a teacher assigns a challenge or an
// assignment. Everything asserted is what the student/parent sees and does in
// the UI: the bell item, tapping it, and the exact screen/entity it opens.
//
// Accounts: student-notif + parent-notif (dedicated, see accounts.js), and the
// login-less E2E_NOTIF_TEACHER as the assigning teacher.
//
// Parallel-safe on shared accounts: every test uses its own challenge (fixed
// index into the Grade 3 CBSE catalog) or uniquely titled assignments, asserts
// only on its own items, and cleans up only its own rows.
//
// Local run against unmerged service branches: set E2E_SERVICE_OVERRIDES
// (see helpers/serviceOverrides.js) and point CHALLENGES_SERVICE_URL /
// ASSIGNMENTS_SERVICE_URL at the same local services.

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { newPageAs } from '../helpers/session.js';
import { accountFor } from '../helpers/accounts.js';
import { applyServiceOverrides } from '../helpers/serviceOverrides.js';
import { dismissAnnouncementIfPresent } from '../helpers/dismissAnnouncement.js';
import { quizModal } from '../helpers/challengesLocators.js';
import {
  listChallenges, assignChallenge, assignChallengeAsParent, completeChallenge, createAssignment,
} from '../helpers/api.js';

// Setup + login + waiting for the bell's poll exceeds the 30s default.
test.describe.configure({ timeout: 90_000 });

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const STUDENT = accountFor('student-notif');
const PARENT = accountFor('parent-notif');
const TEACHER_EMAIL = process.env.E2E_NOTIF_TEACHER;
const STUDENT_NAME = 'Notif Student';

let ids; // { student, parent, teacher }
let catalog; // Grade 3 CBSE challenges
let otherCatalog; // Grade 3 IB PYP (same grade, so assignable to the student)
let wrongGrade; // Grade 4 challenge (rejected by the grade guard)

async function idOf(email) {
  const { data, error } = await db.from('users').select('id').eq('email', email.toLowerCase()).single();
  if (error) throw new Error(`users lookup failed for ${email}: ${error.message}`);
  return data.id;
}

test.beforeAll(async ({ request }) => {
  ids = { student: await idOf(STUDENT.email), parent: await idOf(PARENT.email), teacher: await idOf(TEACHER_EMAIL) };
  catalog = await listChallenges(request, { grade: 'Grade 3', curriculum: 'CBSE' });
  expect(catalog.length, 'need at least 5 Grade 3 CBSE challenges').toBeGreaterThanOrEqual(5);
  otherCatalog = await listChallenges(request, { grade: 'Grade 3', curriculum: 'IB PYP' });
  [wrongGrade] = await listChallenges(request, { grade: 'Grade 4', curriculum: 'CBSE' });
});

// ── per-test data, removed afterwards ──
const created = { challenges: [], assignments: [] };

test.afterEach(async () => {
  for (const ch of created.challenges.splice(0)) await resetChallenge(ch);
  for (const a of created.assignments.splice(0)) await removeAssignment(a);
});

// The legacy producer path still runs in parallel and writes a system chat
// message to the parent for every assign — remove this test's ones too.
async function removeLegacyParentMessages(title) {
  await db.from('messages').delete()
    .eq('recipient_email', PARENT.email.toLowerCase()).eq('sender_email', 'system@aivorah.com')
    .like('content', `%"${title}"%`);
}

async function resetChallenge(ch) {
  await db.from('notifications').delete().in('recipient_id', [ids.student, ids.parent]).eq('data->>challengeId', ch.id);
  await db.from('challenge_assignments').delete().eq('student_id', ids.student).eq('challenge_id', ch.id);
  await removeLegacyParentMessages(ch.title);
}

async function removeAssignment(a) {
  await db.from('notifications').delete().eq('entity_type', 'assignment').eq('entity_id', String(a.id));
  await db.from('schedule_events').delete().eq('assignment_id', a.id);
  await db.from('assignments').delete().eq('id', a.id);
  await removeLegacyParentMessages(a.title);
}

// Each test owns one challenge; start from a clean slate for it.
async function freshChallenge(index) {
  const ch = catalog[index];
  await resetChallenge(ch);
  created.challenges.push(ch);
  return ch;
}

async function teacherAssignsChallenge(request, ch) {
  return assignChallenge(request, { challengeId: ch.id, studentId: ids.student, teacherId: TEACHER_EMAIL });
}

async function teacherCreatesAssignment(request, title) {
  const a = await createAssignment(request, {
    teacherId: ids.teacher, studentId: ids.student, title, subject: 'Mathematics',
    dueDate: new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10),
  });
  created.assignments.push({ id: a.id, title });
  return a;
}

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

test('1. teacher assigns a challenge → student gets it in the bell → tap opens that exact challenge', async ({ browser, request }) => {
  const ch = await freshChallenge(0);
  await teacherAssignsChallenge(request, ch);

  const page = await openAppAs(browser, 'student-notif');
  await openBell(page);
  const item = await bellItemWithText(page, `New challenge: ${ch.title}`);
  await item.first().click();

  await expect(quizModal(page)).toBeVisible({ timeout: 20000 });
  await expect(quizModal(page).getByText(ch.title).first()).toBeVisible();
});

test('2. teacher assigns a challenge → parent gets it → tap opens the right child and that exact challenge', async ({ browser, request }) => {
  const ch = await freshChallenge(1);
  await teacherAssignsChallenge(request, ch);

  const page = await openAppAs(browser, 'parent-notif');
  await openBell(page);
  const item = await bellItemWithText(page, `New challenge for ${STUDENT_NAME}: ${ch.title}`);
  await item.first().click();

  // The parent screen first loads the child list from the deployed students-service.
  const pinned = page.getByTestId(`deeplink-challenge-${ch.id}`);
  await expect(pinned).toBeVisible({ timeout: 45000 });
  await expect(pinned.getByText(`From your notification · ${STUDENT_NAME}`)).toBeVisible();
  await expect(pinned.getByText(ch.title)).toBeVisible();
});

test('3. teacher assigns an assignment → student taps it → that exact assignment opens', async ({ browser, request }) => {
  const title = `Notif E2E T3 ${Date.now()}`;
  await teacherCreatesAssignment(request, title);

  const page = await openAppAs(browser, 'student-notif');
  await openBell(page);
  const item = await bellItemWithText(page, `New quiz: ${title}`);
  await item.first().click();

  await expect(page.getByRole('dialog').getByText(title).first()).toBeVisible({ timeout: 20000 });
});

test('4. teacher assigns an assignment → parent taps it → right child, that exact assignment’s details', async ({ browser, request }) => {
  const title = `Notif E2E T4 ${Date.now()}`;
  await teacherCreatesAssignment(request, title);

  const page = await openAppAs(browser, 'parent-notif');
  await openBell(page);
  const item = await bellItemWithText(page, `New quiz for ${STUDENT_NAME}: ${title}`);
  await item.first().click();

  // Waits on the child list (deployed students-service) before the detail can open.
  await expect(page.getByRole('dialog').getByText(title).first()).toBeVisible({ timeout: 45000 });
});

test('5. newest notification is on top', async ({ browser, request }) => {
  const older = `Notif E2E T5 older ${Date.now()}`;
  await teacherCreatesAssignment(request, older);
  const ch = await freshChallenge(2);
  await teacherAssignsChallenge(request, ch); // created after the assignment

  const page = await openAppAs(browser, 'student-notif');
  await openBell(page);
  await bellItemWithText(page, `New challenge: ${ch.title}`);
  await bellItemWithText(page, `New quiz: ${older}`);

  const texts = await bellItems(page).allInnerTexts();
  const newerAt = texts.findIndex(t => t.includes(`New challenge: ${ch.title}`));
  const olderAt = texts.findIndex(t => t.includes(`New quiz: ${older}`));
  expect(newerAt).toBeGreaterThanOrEqual(0);
  expect(newerAt).toBeLessThan(olderAt);
});

test('6. opening one notification marks only that one read (and it stays read after reload)', async ({ browser, request }) => {
  const stamp = Date.now();
  const opened = `Notif E2E T6 opened ${stamp}`;
  const other = `Notif E2E T6 other ${stamp}`;
  await teacherCreatesAssignment(request, opened);
  await teacherCreatesAssignment(request, other);

  const page = await openAppAs(browser, 'student-notif');
  await openBell(page);
  const openedItem = await bellItemWithText(page, `New quiz: ${opened}`);
  await bellItemWithText(page, `New quiz: ${other}`);
  await expect(openedItem.first().getByTestId('notif-unread-dot')).toBeVisible();
  await openedItem.first().click();
  await expect(page.getByRole('dialog').getByText(opened).first()).toBeVisible({ timeout: 20000 });

  await page.reload(); // read state must come from the server, not local memory
  await dismissAnnouncementIfPresent(page);
  await openBell(page);
  const openedAfter = await bellItemWithText(page, `New quiz: ${opened}`);
  const otherAfter = await bellItemWithText(page, `New quiz: ${other}`);
  await expect(openedAfter.first().getByTestId('notif-unread-dot')).toHaveCount(0);
  await expect(otherAfter.first().getByTestId('notif-unread-dot')).toBeVisible();
});

test('7. repeating the same assign request does not create a duplicate notification', async ({ browser, request }) => {
  const ch = await freshChallenge(3);
  await teacherAssignsChallenge(request, ch);
  const again = await teacherAssignsChallenge(request, ch);
  expect(again.alreadyAssigned).toBe(true); // setup sanity, not the assertion under test

  const page = await openAppAs(browser, 'student-notif');
  await openBell(page);
  const items = await bellItemWithText(page, `New challenge: ${ch.title}`);
  await expect(items).toHaveCount(1);
});

test('8. re-assigning a completed challenge creates a new notification', async ({ browser, request }) => {
  const ch = await freshChallenge(4);
  const first = await teacherAssignsChallenge(request, ch);
  await completeChallenge(request, first.assignmentId, { studentId: ids.student, score: 100 });
  const second = await teacherAssignsChallenge(request, ch);
  expect(second.alreadyAssigned).toBeFalsy(); // setup sanity

  const page = await openAppAs(browser, 'student-notif');
  await openBell(page);
  const items = await bellItemWithText(page, `New challenge: ${ch.title}`);
  await expect(items).toHaveCount(2);
  await expect(items.first().getByTestId('notif-unread-dot')).toBeVisible();
});

test('9. class-wide assignment reaches the linked student and that student’s parent', async ({ browser, request }) => {
  const title = `Notif E2E T9 class ${Date.now()}`;
  // Teacher broadcast (no studentId): recipients are that teacher's linked students.
  const res = await request.post(`${process.env.ASSIGNMENTS_SERVICE_URL}/assignments`, {
    data: {
      title, subject: 'Mathematics', dueDate: new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10),
      createdById: ids.teacher, createdByRole: 'teacher', curriculum: 'CBSE', grade: 'Grade 3', type: 'quiz',
      quizQuestions: [{ question: 'What is 7 + 5?', type: 'mcq', options: ['12', '10', '13', '11'], correct: '12' }],
    },
  });
  expect(res.ok(), await res.text()).toBeTruthy();
  const a = await res.json();
  created.assignments.push({ id: a.id, title });

  const student = await openAppAs(browser, 'student-notif');
  await openBell(student);
  await bellItemWithText(student, `New quiz: ${title}`);

  const parent = await openAppAs(browser, 'parent-notif');
  await openBell(parent);
  await (await bellItemWithText(parent, `New quiz for ${STUDENT_NAME}: ${title}`)).first().click();
  await expect(parent.getByRole('dialog').getByText(title).first()).toBeVisible({ timeout: 45000 });
});

test('10. the parent who assigns is not notified of their own action; the student is', async ({ browser, request }) => {
  const ch = otherCatalog[0];
  await resetChallenge(ch);
  created.challenges.push(ch);
  await assignChallengeAsParent(request, { challengeId: ch.id, studentId: ids.student, parentEmail: PARENT.email });

  const student = await openAppAs(browser, 'student-notif');
  await openBell(student);
  await bellItemWithText(student, `New challenge: ${ch.title}`);

  // Anchor on a notification the parent should get, then check the self-assigned one is absent.
  const anchor = `Notif E2E T10 anchor ${Date.now()}`;
  await teacherCreatesAssignment(request, anchor);
  const parent = await openAppAs(browser, 'parent-notif');
  await openBell(parent);
  await bellItemWithText(parent, `New quiz for ${STUDENT_NAME}: ${anchor}`);
  await expect(bellItems(parent).filter({ hasText: ch.title })).toHaveCount(0);
});

test('11. a rejected assign creates no notification', async ({ browser, request }) => {
  const res = await request.post(`${process.env.CHALLENGES_SERVICE_URL}/challenges/assign`, {
    data: { challengeId: wrongGrade.id, studentId: ids.student, assignedById: TEACHER_EMAIL, assignedByRole: 'teacher' },
  });
  expect(res.status()).toBe(400); // setup sanity: grade guard rejects it

  const anchor = `Notif E2E T11 anchor ${Date.now()}`;
  await teacherCreatesAssignment(request, anchor);
  const page = await openAppAs(browser, 'student-notif');
  await openBell(page);
  await bellItemWithText(page, `New quiz: ${anchor}`);
  await expect(bellItems(page).filter({ hasText: wrongGrade.title })).toHaveCount(0);
});

test('12. the unread badge matches the unread items, and drops when one is opened', async ({ browser, request }) => {
  const title = `Notif E2E T12 ${Date.now()}`;
  await teacherCreatesAssignment(request, title);
  const page = await openAppAs(browser, 'parent-notif');
  await openBell(page);
  const item = await bellItemWithText(page, `New quiz for ${STUDENT_NAME}: ${title}`);

  // No badge is rendered at 0; parent-notif never has 10+ unread in this spec, so it's a plain number.
  const badge = page.getByTestId('header-bell-badge');
  const badgeCount = async () => ((await badge.count()) ? Number((await badge.first().innerText()).trim()) : 0);
  const unreadDots = () => bellItems(page).getByTestId('notif-unread-dot').count();
  const before = await badgeCount();
  expect(before).toBe(await unreadDots());

  await item.first().click();
  await expect(page.getByRole('dialog').getByText(title).first()).toBeVisible({ timeout: 45000 });
  await expect.poll(badgeCount, { timeout: 20000 }).toBeLessThan(before);
});

test('13. legacy still works: deadline events show, and the bell falls back to the legacy feed when V2 is down', async ({ browser, request }) => {
  const title = `Notif E2E T13 ${Date.now()}`;
  await teacherCreatesAssignment(request, title);

  // V2 up: the legacy-derived due-date event is still in the same bell.
  const page = await openAppAs(browser, 'student-notif');
  await openBell(page);
  await bellItemWithText(page, `New quiz: ${title}`);
  await bellItemWithText(page, `${title} — Quiz due`);

  // V2 down (simulated outage of /notifications only): legacy assignment item, no V2 rows.
  const down = await newPageAs(browser, 'student-notif');
  await applyServiceOverrides(down.context());
  await down.context().route(/\/notifications(\/|\?|$)/, route => route.fulfill({ status: 503, body: '{}' }));
  await down.goto('/');
  await dismissAnnouncementIfPresent(down);
  await openBell(down);
  await expect(bellItems(down).filter({ hasText: title }).first()).toBeVisible({ timeout: 40000 });
  await expect(bellItems(down).filter({ hasText: 'New quiz:' })).toHaveCount(0);
});

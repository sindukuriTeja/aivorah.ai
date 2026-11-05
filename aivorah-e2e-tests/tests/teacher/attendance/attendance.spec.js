// Teacher Attendance (/teacher/attendance) on aivorah-attendance-service.
//
// Fixtures (scripts/seed-attendance-fixtures.mjs, E2E School Mutate, Grade 5):
//   teacher-att      class teacher of section E2E-ATT
//   teacher-att-b    class teacher of section E2E-ATT-B
//   teacher-att-none no class
// Section E2E-ATT holds att-1/2/3 (parent specs) and att-t1/t2 (ONLY these teacher specs mark them);
// att-b1 is in E2E-ATT-B. Each test marks its own student/date pair, so they run in parallel.

import { test, expect } from '@playwright/test';
import { applySession, statePath } from '../../helpers/auth.js';
import { getUserIdByEmail } from '../../helpers/api.js';
import { dismissAnnouncementIfPresent } from '../../helpers/dismissAnnouncement.js';
import { clickMenuItem } from '../../helpers/timetableLocators.js';
import { markAttendance, studentEmail, todayISO, GRADE, SECTION_A, SECTION_B } from '../../helpers/attendanceApi.js';
import {
  classChip, classChips, dateInput, studentRow, studentRows,
  statusButton, saveButton, saveMessage, emptyState,
} from '../../helpers/attendanceLocators.js';

export const REQUIRED_ACCOUNTS = ['teacher-att', 'teacher-att-none'];

const EDIT_DATE = '2026-09-15';

async function idOf(request, account) {
  return getUserIdByEmail(request, studentEmail(account));
}

async function openAttendance(page, query = '') {
  await page.goto(`/teacher/attendance${query}`);
  await dismissAnnouncementIfPresent(page);
}

async function expectSelected(locator) {
  await expect(locator).toHaveAttribute('aria-selected', 'true', { timeout: 15000 });
}

test.describe('Teacher Attendance - class teacher', () => {
  test.use({ storageState: statePath('teacher-att') });
  test.beforeEach(async ({ context }) => { await applySession(context, 'teacher-att'); });

  test('1. the sidebar Attendance item opens the Attendance screen', async ({ page }) => {
    await page.goto('/dashboard');
    await dismissAnnouncementIfPresent(page);
    await clickMenuItem(page, 'Attendance');
    await expect(page).toHaveURL(/\/teacher\/attendance/, { timeout: 15000 });
    await expect(classChip(page, GRADE, SECTION_A)).toBeVisible({ timeout: 20000 });
  });

  test('2. only the classes this teacher is class teacher of are listed', async ({ page }) => {
    await openAttendance(page);
    await expect(classChip(page, GRADE, SECTION_A)).toBeVisible({ timeout: 20000 });
    await expect(classChip(page, GRADE, SECTION_B)).toHaveCount(0);
    await expect(classChips(page)).toHaveCount(1);
  });

  test("3. picking the class shows exactly that class's students", async ({ page, request }) => {
    // read-only expected-value lookup
    const inClass = await Promise.all(['student-att-1', 'student-att-2', 'student-att-3', 'student-att-t1', 'student-att-t2'].map((a) => idOf(request, a)));
    const otherClass = await idOf(request, 'student-att-b1');

    await openAttendance(page);
    await classChip(page, GRADE, SECTION_A).click();
    for (const id of inClass) await expect(studentRow(page, id)).toBeVisible({ timeout: 20000 });
    await expect(studentRow(page, otherClass)).toHaveCount(0);
    await expect(studentRows(page)).toHaveCount(inClass.length);
  });

  test('4. marking absent and late for today, saving, shows Saved and is still there after a reload', async ({ page, request }) => {
    const t1 = await idOf(request, 'student-att-t1');
    const t2 = await idOf(request, 'student-att-t2');
    // setup: start today's marks from a known state
    await markAttendance(request, { date: todayISO(), records: { [t1]: 'present', [t2]: 'present' } });

    await openAttendance(page);
    await classChip(page, GRADE, SECTION_A).click();
    await statusButton(page, t1, 'absent').click();
    await statusButton(page, t2, 'late').click();
    await saveButton(page).click();
    await expect(saveMessage(page)).toContainText(/saved/i, { timeout: 15000 });

    await page.reload();
    await dismissAnnouncementIfPresent(page);
    await classChip(page, GRADE, SECTION_A).click();
    await expectSelected(statusButton(page, t1, 'absent'));
    await expectSelected(statusButton(page, t2, 'late'));
  });

  test('5. an earlier day that already has marks can be changed, and the change stays', async ({ page, request }) => {
    const t1 = await idOf(request, 'student-att-t1');
    await markAttendance(request, { date: EDIT_DATE, records: { [t1]: 'present' } }); // setup

    await openAttendance(page);
    await classChip(page, GRADE, SECTION_A).click();
    await dateInput(page).fill(EDIT_DATE);
    await expectSelected(statusButton(page, t1, 'present'));
    await statusButton(page, t1, 'absent').click();
    await saveButton(page).click();
    await expect(saveMessage(page)).toContainText(/saved/i, { timeout: 15000 });

    await page.reload();
    await dismissAnnouncementIfPresent(page);
    await classChip(page, GRADE, SECTION_A).click();
    await dateInput(page).fill(EDIT_DATE);
    await expectSelected(statusButton(page, t1, 'absent'));
  });

  test("7. another teacher's class can't be opened: an error shows and no students are listed", async ({ page, request }) => {
    const b1 = await idOf(request, 'student-att-b1');
    await openAttendance(page, `?grade=${encodeURIComponent(GRADE)}&section=${encodeURIComponent(SECTION_B)}`);
    await expect(page.getByTestId('attendance-error')).toBeVisible({ timeout: 20000 });
    await expect(studentRow(page, b1)).toHaveCount(0);
    await expect(saveButton(page)).toHaveCount(0);
  });
});

test.describe('Teacher Attendance - teacher with no class', () => {
  test.use({ storageState: statePath('teacher-att-none') });
  test.beforeEach(async ({ context }) => { await applySession(context, 'teacher-att-none'); });

  test('6. a teacher who is nobody\'s class teacher sees "No classes assigned"', async ({ page }) => {
    await openAttendance(page);
    await expect(emptyState(page)).toContainText(/no classes assigned/i, { timeout: 20000 });
    await expect(classChips(page)).toHaveCount(0);
  });
});

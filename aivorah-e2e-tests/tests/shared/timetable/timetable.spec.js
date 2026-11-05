// Timetable (/timetable) - who can set up, edit and view a class timetable.
//
// Rules under test (aivorah-schedule-service routes/timetable.js):
//   - school admin: sets up the bell schedule and edits any slot
//   - homeroom teacher: same, for their own class
//   - any other teacher in the school: edits slots, not the bell schedule
//   - parent / student: view their (child's) class only, no editing
//
// Each test owns one TSRA class, seeded and removed through the DB, so the
// tests run in parallel. Classes: admin-a -> Grade 9 A / Grade 8 A,
// teacher-a (homeroom of Grade 7 A) -> Grade 7 A, teacher-b -> PYP 4 B,
// parent-a and student-a (both Grade 3 A) -> Grade 3 A, and Grade 6 A for the blocked case.

import { test, expect } from '@playwright/test';
import { newPageAs } from '../../helpers/session.js';
import { accountFor } from '../../helpers/accounts.js';
import { dismissAnnouncementIfPresent } from '../../helpers/dismissAnnouncement.js';
import { getSchoolIdByEmail, seedTimetable, deleteTimetable } from '../../helpers/timetableData.js';
import {
  openTimetable, expectTimetableReady, periodsButton, downloadButton, setupDefaultButton,
  clickCell, clickMenuItem, slotSubjectInput, slotRoomInput, slotSaveButton, slotClearButton, addSubjectButton,
} from '../../helpers/timetableLocators.js';

export const REQUIRED_ACCOUNTS = ['admin-a', 'teacher-a', 'teacher-b', 'parent-a', 'student-a'];

let schoolId;
test.beforeAll(async () => {
  schoolId = await getSchoolIdByEmail(accountFor('admin-a').email);
});

async function open(page, cls) {
  await openTimetable(page, cls);
  await expectTimetableReady(page);
  await dismissAnnouncementIfPresent(page);
}

test.describe('Timetable', () => {
  test.setTimeout(90000);

  test('school admin sets up the default bell schedule for a class with none', async ({ browser }) => {
    const cls = { grade: 'Grade 9', section: 'A' };
    await deleteTimetable(schoolId, cls.grade, cls.section);
    try {
      const page = await newPageAs(browser, 'admin-a');
      await open(page);
      await page.getByRole('button', { name: 'Grade 9', exact: true }).click();
      await page.getByRole('button', { name: 'A', exact: true }).click();

      await expect(page.getByText('Set up the bell schedule')).toBeVisible();
      await setupDefaultButton(page).click();

      await expect(page.getByText('P1', { exact: true }).first()).toBeVisible({ timeout: 15000 });
      await expect(page.getByText('Mon', { exact: true }).first()).toBeVisible();

      await page.reload();
      await expectTimetableReady(page);
      await page.getByRole('button', { name: 'Grade 9', exact: true }).click();
      await page.getByRole('button', { name: 'A', exact: true }).click();
      await expect(page.getByText('P1', { exact: true }).first()).toBeVisible({ timeout: 15000 });
      await expect(page.getByText('Set up the bell schedule')).toHaveCount(0);
    } finally {
      await deleteTimetable(schoolId, cls.grade, cls.section);
    }
  });

  test('school admin adds a period, and duplicate labels are rejected', async ({ browser }) => {
    const cls = { grade: 'Grade 8', section: 'A' };
    await seedTimetable(schoolId, cls.grade, cls.section);
    try {
      const page = await newPageAs(browser, 'admin-a');
      await open(page);
      await page.getByRole('button', { name: 'Grade 8', exact: true }).click();
      await page.getByRole('button', { name: 'A', exact: true }).click();
      await expect(page.getByText('P3', { exact: true }).first()).toBeVisible({ timeout: 15000 });

      await periodsButton(page).click();
      await expect(page.getByText('Manage periods')).toBeVisible();

      // A new period gets the next free label (P4).
      await page.getByRole('button', { name: /Add period$/ }).click();
      const labels = page.getByPlaceholder('P1');
      await expect(labels.last()).toHaveValue('P4');

      // Renaming it to an existing label is blocked.
      await labels.last().fill('P1');
      await page.getByRole('button', { name: 'Save bell schedule' }).click();
      await expect(page.getByText('Class period labels (P1, P2 …) must each be unique.')).toBeVisible();

      await labels.last().fill('P4');
      await page.getByRole('button', { name: 'Save bell schedule' }).click();
      await expect(page.getByText('Manage periods')).toHaveCount(0, { timeout: 15000 });
      await expect(page.getByText('P4', { exact: true }).first()).toBeVisible({ timeout: 15000 });

      await page.reload();
      await expectTimetableReady(page);
      await page.getByRole('button', { name: 'Grade 8', exact: true }).click();
      await page.getByRole('button', { name: 'A', exact: true }).click();
      await expect(page.getByText('P4', { exact: true }).first()).toBeVisible({ timeout: 15000 });
    } finally {
      await deleteTimetable(schoolId, cls.grade, cls.section);
    }
  });

  test('homeroom teacher adds, edits and clears a subject slot', async ({ browser }) => {
    const cls = { grade: 'Grade 7', section: 'A' };
    const subject = `E2E-TT Science ${Date.now()}`;
    await seedTimetable(schoolId, cls.grade, cls.section);
    try {
      const page = await newPageAs(browser, 'teacher-a');
      await open(page, cls);
      await expect(periodsButton(page)).toBeVisible({ timeout: 15000 });

      await clickCell(page, 'Mon', 'P1');
      await expect(page.getByText('Free period')).toBeVisible();
      await addSubjectButton(page).click();
      await slotSubjectInput(page).fill('   ');
      await expect(slotSaveButton(page)).toBeDisabled();
      await slotSubjectInput(page).fill(subject);
      await slotRoomInput(page).fill('Lab 2');
      await slotSaveButton(page).click();

      await expect(page.getByText(subject)).toBeVisible({ timeout: 15000 });
      await expect(page.getByText('Lab 2')).toBeVisible();

      await page.reload();
      await expectTimetableReady(page);
      await expect(page.getByText(subject)).toBeVisible({ timeout: 15000 });

      // Edit the room, then clear the slot.
      await page.getByText(subject).click();
      await addSubjectButton(page).click();
      await slotRoomInput(page).fill('Lab 3');
      await slotSaveButton(page).click();
      await expect(page.getByText('Lab 3')).toBeVisible({ timeout: 15000 });

      await page.getByText(subject).click();
      await addSubjectButton(page).click();
      await slotClearButton(page).click();
      await expect(page.getByText(subject)).toHaveCount(0, { timeout: 15000 });
    } finally {
      await deleteTimetable(schoolId, cls.grade, cls.section);
    }
  });

  test('another teacher in the school edits a slot but not the bell schedule', async ({ browser }) => {
    const cls = { grade: 'PYP 4', section: 'B' };
    const subject = `E2E-TT Maths ${Date.now()}`;
    await seedTimetable(schoolId, cls.grade, cls.section);
    try {
      const page = await newPageAs(browser, 'teacher-b');
      await open(page, cls);
      await expect(page.getByText('P1', { exact: true }).first()).toBeVisible({ timeout: 15000 });
      await expect(periodsButton(page)).toHaveCount(0);

      await clickCell(page, 'Tue', 'P2');
      await addSubjectButton(page).click();
      await slotSubjectInput(page).fill(subject);
      await slotSaveButton(page).click();
      await expect(page.getByText(subject)).toBeVisible({ timeout: 15000 });
    } finally {
      await deleteTimetable(schoolId, cls.grade, cls.section);
    }
  });

  test('parent and student view the class timetable read-only; parent downloads it as PDF', async ({ browser }) => {
    test.setTimeout(150000);
    const cls = { grade: 'Grade 3', section: 'A' };
    const subject = `E2E-TT English ${Date.now()}`;
    await seedTimetable(schoolId, cls.grade, cls.section, [
      { day: 'WED', periodCode: 'P2', subject, room: 'Room 12' },
    ]);
    try {
      const page = await newPageAs(browser, 'parent-a');
      await open(page, cls);
      await expect(page.getByText(subject)).toBeVisible({ timeout: 15000 });
      await expect(periodsButton(page)).toHaveCount(0);

      await page.getByText(subject).click();
      await expect(page.getByText('Room 12').last()).toBeVisible();
      await expect(page.getByText('Wed', { exact: true }).last()).toBeVisible();
      await expect(addSubjectButton(page)).toHaveCount(0);

      await page.reload();
      await expectTimetableReady(page);

      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 30000 }),
        downloadButton(page).click(),
      ]);
      expect(download.suggestedFilename()).toBe('Grade 3 A Timetable.pdf');

      // The student in that class sees the same timetable from the menu, also read-only.
      const student = await newPageAs(browser, 'student-a');
      await student.goto('/dashboard');
      await dismissAnnouncementIfPresent(student);
      await clickMenuItem(student, 'Timetable');
      await expectTimetableReady(student);
      await expect(student.getByText('Grade 3 A', { exact: true })).toBeVisible({ timeout: 15000 });
      await expect(student.getByText(subject)).toBeVisible({ timeout: 15000 });
      await student.getByText(subject).click();
      await expect(student.getByText('Room 12').last()).toBeVisible();
      await expect(addSubjectButton(student)).toHaveCount(0);
    } finally {
      await deleteTimetable(schoolId, cls.grade, cls.section);
    }
  });

  test('parent can not open a class their child is not in', async ({ browser }) => {
    const page = await newPageAs(browser, 'parent-a');
    await open(page, { grade: 'Grade 6', section: 'A' });
    await expect(page.getByText('Not allowed to view this timetable')).toBeVisible({ timeout: 15000 });
  });
});

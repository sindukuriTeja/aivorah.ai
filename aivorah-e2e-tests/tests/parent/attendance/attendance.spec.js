// Parent Attendance (/parent/attendance) and the dashboard Attendance card, on aivorah-attendance-service.
//
// Fixtures (scripts/seed-attendance-fixtures.mjs): parent-att -> att-1, att-2; parent-att-dash -> att-3.
// Marks are set up as the class teacher (teacher-att) on dates only these tests use.
// Rate = (present + late / 2) / total, the monolith's formula kept by the new service.

import { test, expect } from '@playwright/test';
import { applySession, statePath } from '../../helpers/auth.js';
import { getUserIdByEmail } from '../../helpers/api.js';
import { dismissAnnouncementIfPresent } from '../../helpers/dismissAnnouncement.js';
import { clickMenuItem } from '../../helpers/timetableLocators.js';
import { assertAttendanceStat } from '../../helpers/assertAttendanceStat.js';
import { markAttendance, studentEmail } from '../../helpers/attendanceApi.js';
import { sidebarAttendanceLink, childChip, childChips, attendanceRate, historyRow } from '../../helpers/attendanceLocators.js';

export const REQUIRED_ACCOUNTS = ['parent-att', 'parent-att-dash'];

async function idOf(request, account) {
  return getUserIdByEmail(request, studentEmail(account));
}

function count(page, status) {
  return page.getByTestId(`attendance-count-${status}`);
}

test.describe('Parent Attendance', () => {
  test.use({ storageState: statePath('parent-att') });
  test.beforeEach(async ({ context }) => { await applySession(context, 'parent-att'); });

  test('8. the parent menu has Attendance and it opens the Attendance page', async ({ page }) => {
    await page.goto('/parent/dashboard');
    await dismissAnnouncementIfPresent(page);
    await clickMenuItem(page, 'Attendance');
    await expect(page).toHaveURL(/\/parent\/attendance/, { timeout: 15000 });
    await expect(childChips(page).first()).toBeVisible({ timeout: 20000 });
  });

  test('9. after the teacher marks the child, the parent sees the right counts, rate and history', async ({ page, request }) => {
    const child = await idOf(request, 'student-att-1');
    await markAttendance(request, { date: '2026-09-01', records: { [child]: 'present' } }); // setup
    await markAttendance(request, { date: '2026-09-02', records: { [child]: 'absent' } });
    await markAttendance(request, { date: '2026-09-03', records: { [child]: 'late' } });

    await page.goto('/parent/attendance');
    await dismissAnnouncementIfPresent(page);
    await childChip(page, child).click();
    await expect(count(page, 'present')).toHaveText('1', { timeout: 20000 });
    await expect(count(page, 'absent')).toHaveText('1');
    await expect(count(page, 'late')).toHaveText('1');
    await expect(attendanceRate(page)).toContainText('50%');
    await expect(historyRow(page, '2026-09-02')).toContainText(/absent/i);
    await expect(historyRow(page, '2026-09-03')).toContainText(/late/i);
  });

  test('10. a child with no marks shows "No attendance recorded yet", not 100%', async ({ page, request }) => {
    const child = await idOf(request, 'student-att-2'); // never marked by any spec
    await page.goto('/parent/attendance');
    await dismissAnnouncementIfPresent(page);
    await childChip(page, child).click();
    await expect(attendanceRate(page)).toContainText('No attendance recorded yet', { timeout: 20000 });
    await expect(attendanceRate(page)).not.toContainText('100%');
  });

  test('11. the parent sees only their own children', async ({ page, request }) => {
    const mine = await Promise.all(['student-att-1', 'student-att-2'].map((a) => idOf(request, a)));
    const notMine = await idOf(request, 'student-att-3');
    await page.goto('/parent/attendance');
    await dismissAnnouncementIfPresent(page);
    for (const id of mine) await expect(childChip(page, id)).toBeVisible({ timeout: 20000 });
    await expect(childChip(page, notMine)).toHaveCount(0);
    await expect(childChips(page)).toHaveCount(2);
  });
});

test.describe('Parent dashboard Attendance card', () => {
  test.use({ storageState: statePath('parent-att-dash') });
  test.beforeEach(async ({ context }) => { await applySession(context, 'parent-att-dash'); });

  test('12. the dashboard card and the Attendance page show the same numbers', async ({ page, request }) => {
    const child = await idOf(request, 'student-att-3');
    await markAttendance(request, { date: '2026-09-04', records: { [child]: 'present' } }); // setup
    await markAttendance(request, { date: '2026-09-05', records: { [child]: 'absent' } });

    await page.goto('/parent/dashboard');
    await dismissAnnouncementIfPresent(page);
    await assertAttendanceStat(page, 'Present', 1);
    await assertAttendanceStat(page, 'Absent', 1);
    await expect(page.getByText('Overall attendance: 50%', { exact: true })).toBeVisible({ timeout: 20000 });

    await page.goto('/parent/attendance');
    await dismissAnnouncementIfPresent(page);
    await childChip(page, child).click();
    await expect(count(page, 'present')).toHaveText('1', { timeout: 20000 });
    await expect(count(page, 'absent')).toHaveText('1');
    await expect(attendanceRate(page)).toContainText('50%');
  });
});

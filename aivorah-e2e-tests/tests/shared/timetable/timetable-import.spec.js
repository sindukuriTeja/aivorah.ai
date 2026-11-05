// Timetable PDF import (/timetable → Import PDF). The PDF holds three class
// timetables (Class VI - A, VIII - A, IX - A); the admin saves only Grade 6 A
// so it never touches the classes other timetable specs use. Grade 6 A's
// timetable is removed afterwards only if this test created it.

import path from 'path';
import { fileURLToPath } from 'url';
import { test, expect } from '@playwright/test';
import { newPageAs } from '../../helpers/session.js';
import { accountFor } from '../../helpers/accounts.js';
import { dismissAnnouncementIfPresent } from '../../helpers/dismissAnnouncement.js';
import { getSchoolIdByEmail, deleteTimetable, timetableExists } from '../../helpers/timetableData.js';
import { openTimetable, expectTimetableReady } from '../../helpers/timetableLocators.js';

export const REQUIRED_ACCOUNTS = ['admin-a', 'parent-a'];

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PDF = path.resolve(__dirname, '../../fixtures/resources/class-timetables.pdf');

let schoolId;
test.beforeAll(async () => {
  schoolId = await getSchoolIdByEmail(accountFor('admin-a').email);
});

test.describe('Timetable PDF import', () => {
  test('school admin imports one class from a multi-class PDF and sees it in the grid', async ({ browser }) => {
    test.setTimeout(240000);
    const existed = await timetableExists(schoolId, 'Grade 6', 'A');
    try {
      const page = await newPageAs(browser, 'admin-a');
      await openTimetable(page);
      await expectTimetableReady(page);
      await dismissAnnouncementIfPresent(page);

      await page.getByRole('button', { name: /Import PDF$/ }).click();
      const [chooser] = await Promise.all([
        page.waitForEvent('filechooser'),
        page.getByRole('button', { name: /Choose PDF$/ }).click(),
      ]);
      await chooser.setFiles(PDF);

      // Reading takes up to a minute; every class is matched to the school's class.
      await expect(page.getByText(/Found 3 classes/)).toBeVisible({ timeout: 150000 });
      for (const [label, cls] of [['Class VI - A', 'Grade 6 A'], ['Class VIII - A', 'Grade 8 A'], ['Class IX - A', 'Grade 9 A']]) {
        await expect(page.getByRole('button', { name: `Class for ${label}` })).toHaveText(new RegExp(cls));
      }

      // Keep only Grade 6 A.
      await page.getByRole('checkbox', { name: 'Include Class VIII - A' }).click();
      await page.getByRole('checkbox', { name: 'Include Class IX - A' }).click();
      await page.getByRole('button', { name: 'Save 1 timetable' }).click();
      await expect(page.getByText(/Grade 6 A: saved \(36 subjects\)/)).toBeVisible({ timeout: 30000 });
      await page.getByRole('button', { name: 'Done' }).click();

      await page.getByRole('button', { name: 'Grade 6', exact: true }).click();
      await expect(page.getByText('P6', { exact: true }).first()).toBeVisible({ timeout: 15000 });
      await expect(page.getByText('Computer').first()).toBeVisible();
      await expect(page.getByText('Short Break', { exact: false }).or(page.getByText(/BRK/)).first()).toBeVisible();
    } finally {
      if (!existed) await deleteTimetable(schoolId, 'Grade 6', 'A');
    }
  });

  test('parent has no Import PDF button', async ({ browser }) => {
    const page = await newPageAs(browser, 'parent-a');
    await openTimetable(page);
    await expectTimetableReady(page);
    await expect(page.getByText('Weekly class schedule')).toBeVisible();
    await expect(page.getByRole('button', { name: /Import PDF$/ })).toHaveCount(0);
  });
});

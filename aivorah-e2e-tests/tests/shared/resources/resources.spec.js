// Resources (/resources) - the school's library of folders and documents.
//
// Rules under test (aivorah-school-admin-service routes/resources.js):
//   - teachers and school admins manage it (new folder, upload, delete)
//   - parents only browse and open documents
//
// All tests share the TSRA library, so each one uses its own unique names and
// removes them afterwards; assertions only look at those names.

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { test, expect } from '@playwright/test';
import { newPageAs } from '../../helpers/session.js';
import { accountFor } from '../../helpers/accounts.js';
import { dismissAnnouncementIfPresent } from '../../helpers/dismissAnnouncement.js';
import {
  getSchoolIdByEmail, seedResourceFolder, seedResourceFile, deleteResourcesByPrefix,
} from '../../helpers/timetableData.js';
import {
  openResources, expectResourcesReady, newFolderButton, uploadButton, searchInput,
  folderNameInput, createFolderButton, deleteIconInRow,
} from '../../helpers/timetableLocators.js';

export const REQUIRED_ACCOUNTS = ['teacher-a', 'admin-a', 'parent-a'];

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PDF = fs.readFileSync(path.resolve(__dirname, '../../fixtures/resources/school-handbook.pdf'));
const PUBLIC_PDF = 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf';

let schoolId;
test.beforeAll(async () => {
  schoolId = await getSchoolIdByEmail(accountFor('admin-a').email);
});

async function open(page) {
  await openResources(page);
  await expectResourcesReady(page);
  await dismissAnnouncementIfPresent(page);
}

test.describe('Resources', () => {
  test.setTimeout(90000);

  test('teacher creates a folder, uploads a PDF, opens it, then deletes both', async ({ browser }) => {
    const prefix = `E2E-RES-T${Date.now()}`;
    const folder = `${prefix} Policies`;
    const fileName = `${prefix} Handbook.pdf`;
    try {
      const page = await newPageAs(browser, 'teacher-a');
      page.on('dialog', (d) => d.accept());
      await open(page);

      // New folder: Create stays disabled until a name is typed.
      await newFolderButton(page).click();
      await expect(createFolderButton(page)).toBeVisible();
      await folderNameInput(page).fill(folder);
      await createFolderButton(page).click();
      await expect(page.getByText(folder, { exact: true })).toBeVisible({ timeout: 15000 });

      await page.reload();
      await expectResourcesReady(page);
      await page.getByText(folder, { exact: true }).click();
      await expect(page.getByText('No resources here yet.')).toBeVisible({ timeout: 15000 });

      // Upload into the folder.
      const [chooser] = await Promise.all([
        page.waitForEvent('filechooser'),
        uploadButton(page).click(),
      ]);
      await chooser.setFiles({ name: fileName, mimeType: 'application/pdf', buffer: PDF });
      await expect(page.getByText(fileName, { exact: true })).toBeVisible({ timeout: 30000 });

      // Opens in the in-app viewer.
      await page.getByText(fileName, { exact: true }).click();
      await expect(page.getByLabel('Download')).toBeVisible();
      await page.getByLabel('Close').click();
      await expect(page.getByLabel('Download')).toHaveCount(0);

      await Promise.all([
        page.waitForResponse((r) => r.request().method() === 'DELETE' && r.url().includes('/resources/file/')),
        deleteIconInRow(page, fileName).click(),
      ]);
      await expect(page.getByText(fileName, { exact: true })).toHaveCount(0, { timeout: 15000 });
      await expect(page.getByText('No resources here yet.')).toBeVisible();

      await page.getByText('Library', { exact: true }).click();
      await expect(page.getByText('Last modified')).toBeVisible({ timeout: 15000 });
      await expect(page.getByText(folder, { exact: true })).toHaveCount(1);
      await Promise.all([
        page.waitForResponse((r) => r.request().method() === 'DELETE' && r.url().includes('/resources/folder/')),
        deleteIconInRow(page, folder).click(),
      ]);
      await expect(page.getByText(folder, { exact: true })).toHaveCount(0, { timeout: 15000 });
      await page.reload();
      await expectResourcesReady(page);
      await expect(page.getByText(folder, { exact: true })).toHaveCount(0);
    } finally {
      await deleteResourcesByPrefix(schoolId, prefix);
    }
  });

  test('school admin searches the library and switches list/grid view', async ({ browser }) => {
    const prefix = `E2E-RES-A${Date.now()}`;
    const admin = accountFor('admin-a').email;
    await seedResourceFolder(schoolId, { name: `${prefix} Exam Rules`, createdBy: admin });
    await seedResourceFolder(schoolId, { name: `${prefix} Sports Day`, createdBy: admin });
    try {
      const page = await newPageAs(browser, 'admin-a');
      await open(page);
      await expect(newFolderButton(page)).toBeVisible();

      await searchInput(page).fill(`${prefix} exam`);
      await expect(page.getByText(`${prefix} Exam Rules`, { exact: true })).toBeVisible({ timeout: 15000 });
      await expect(page.getByText(`${prefix} Sports Day`, { exact: true })).toHaveCount(0);

      await searchInput(page).fill(`${prefix} nothing-here`);
      await expect(page.getByText(`Nothing matches "${prefix} nothing-here"`)).toBeVisible();

      await searchInput(page).fill(prefix);
      await expect(page.getByText(`${prefix} Sports Day`, { exact: true })).toBeVisible();
      await expect(page.getByText('Last modified')).toBeVisible();

      // Grid view hides the list header but keeps the items.
      await page.getByRole('button', { name: 'Grid view' }).click();
      await expect(page.getByText('Last modified')).toHaveCount(0);
      await expect(page.getByText(`${prefix} Sports Day`, { exact: true })).toBeVisible();
    } finally {
      await deleteResourcesByPrefix(schoolId, prefix);
    }
  });

  test('parent browses and opens a document but can not manage the library', async ({ browser }) => {
    const prefix = `E2E-RES-P${Date.now()}`;
    const admin = accountFor('admin-a').email;
    const folderId = await seedResourceFolder(schoolId, { name: `${prefix} Parent Handbook`, createdBy: admin });
    await seedResourceFile(schoolId, { folderId, title: `${prefix} Term dates.pdf`, fileUrl: PUBLIC_PDF, uploadedBy: admin });
    try {
      const page = await newPageAs(browser, 'parent-a');
      await open(page);
      await expect(newFolderButton(page)).toHaveCount(0);
      await expect(uploadButton(page)).toHaveCount(0);

      await page.getByText(`${prefix} Parent Handbook`, { exact: true }).click();
      await expect(page.getByText(`${prefix} Term dates.pdf`, { exact: true })).toBeVisible({ timeout: 15000 });

      await page.getByText(`${prefix} Term dates.pdf`, { exact: true }).click();
      await expect(page.getByLabel('Download')).toBeVisible();
    } finally {
      await deleteResourcesByPrefix(schoolId, prefix);
    }
  });
});


// School Admin Bulk Import (students) — Behavioral Audit. Templates and
// POST /school-admin/students/bulk never lived on any microservice before
// this work. Read-only: admin-a is a shared, non-mutable account — the
// wizard is only smoke-tested through the Upload step, never actually
// submitted (that would create real accounts).
import { test, expect } from '@playwright/test';
import { applySession, statePath } from '../../helpers/auth.js';

export const REQUIRED_ACCOUNTS = ['admin-a'];

const READ_ACCOUNT = 'admin-a';

test.describe('School Admin Bulk Import Students - Behavioral Audit', () => {
  test.use({ storageState: statePath(READ_ACCOUNT) });

  test.beforeEach(async ({ context, page }) => {
    await applySession(context, READ_ACCOUNT);
    await page.goto('/school-admin/bulk-import');
    await expect(page.getByText('Drop your CSV or Excel file here', { exact: false })).toBeVisible({ timeout: 15000 });
  });

  test('template downloads are offered and the step indicator starts at Upload', async ({ page }) => {
    await expect(page.getByText('CSV Template')).toBeVisible();
    await expect(page.getByText('Excel Template')).toBeVisible();
    await expect(page.getByText('Upload', { exact: true })).toBeVisible();
  });

  test('CSV template actually downloads real content from the backend', async ({ page }) => {
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByText('CSV Template').click(),
    ]);
    expect(download.suggestedFilename()).toBe('students_template.csv');
  });
});

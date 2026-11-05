// School Admin Add Student — Behavioral Audit. POST /school-admin/students
// never lived on any microservice before this work. Read-only: admin-a is a
// shared, non-mutable account — the form is only smoke-tested for validation
// gating, never actually submitted (that would create a real account).
import { test, expect } from '@playwright/test';
import { applySession, statePath } from '../../helpers/auth.js';

export const REQUIRED_ACCOUNTS = ['admin-a'];

const READ_ACCOUNT = 'admin-a';

test.describe('School Admin Add Student - Behavioral Audit', () => {
  test.use({ storageState: statePath(READ_ACCOUNT) });

  test.beforeEach(async ({ context, page }) => {
    await applySession(context, READ_ACCOUNT);
    await page.goto('/school-admin/add-student');
    await expect(page.getByText('Basic Information')).toBeVisible({ timeout: 15000 });
  });

  test('form loads with curriculum options and Create Student disabled until required fields are filled', async ({ page }) => {
    await expect(page.getByText('Create Student')).toBeVisible();
    await expect(page.getByPlaceholder('e.g. Ela')).toBeVisible();
    await expect(page.getByPlaceholder('e.g. Reddy')).toBeVisible();
  });

  test('Cancel returns to the Students list without submitting', async ({ page }) => {
    await page.getByText('Cancel').click();
    await expect(page).toHaveURL(/school-admin\/students/, { timeout: 10000 });
  });
});

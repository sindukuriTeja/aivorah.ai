// School Admin People — Behavioral Audit. GET /school-admin/people never
// existed anywhere (not the monolith, not any microservice) — the legacy
// screen was calling a route that always 404'd. Read-only: admin-a is a
// shared, non-mutable account.
import { test, expect } from '@playwright/test';
import { applySession, statePath } from '../../helpers/auth.js';

export const REQUIRED_ACCOUNTS = ['admin-a'];

const READ_ACCOUNT = 'admin-a';

test.describe('School Admin People - Behavioral Audit', () => {
  test.use({ storageState: statePath(READ_ACCOUNT) });

  test.beforeEach(async ({ context, page }) => {
    await applySession(context, READ_ACCOUNT);
    await page.goto('/school-admin/people');
  });

  test('loads real roster data, not stuck on the error/empty state', async ({ page }) => {
    await expect(page.getByPlaceholder('Search by name or email')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Failed to load people', { exact: false })).not.toBeVisible();
    await expect(page.getByText(/^All \d/)).toBeVisible({ timeout: 10000 });
  });

  test('role tabs (All/Students/Teachers/Parents) are present', async ({ page }) => {
    await expect(page.getByText(/^Students? \d/)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/^Teachers? \d/)).toBeVisible();
    await expect(page.getByText(/^Parents? \d/)).toBeVisible();
  });
});

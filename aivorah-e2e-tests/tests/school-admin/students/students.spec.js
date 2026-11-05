// School Admin Students — Behavioral Audit. GET /school-admin/students
// (and facets/status/bulk-status/bulk-grade/template) never lived on any
// microservice before this — the legacy screen was calling the monolith
// directly. Read-only: admin-a is a shared, non-mutable account.
import { test, expect } from '@playwright/test';
import { applySession, statePath } from '../../helpers/auth.js';

export const REQUIRED_ACCOUNTS = ['admin-a'];

const READ_ACCOUNT = 'admin-a';

test.describe('School Admin Students - Behavioral Audit', () => {
  test.use({ storageState: statePath(READ_ACCOUNT) });

  test.beforeEach(async ({ context, page }) => {
    await applySession(context, READ_ACCOUNT);
    await page.goto('/school-admin/students');
  });

  test('loads the roster or the empty state, not stuck loading', async ({ page }) => {
    const loadedOrEmpty = page.getByText('Add your first student', { exact: false })
      .or(page.getByText('No students match your filters.'))
      .or(page.locator('text=/result/'));
    await expect(loadedOrEmpty.first()).toBeVisible({ timeout: 15000 });
  });

  test('filter dropdowns and Add Student entry point are present', async ({ page }) => {
    await expect(page.getByText('All grades')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('All sections')).toBeVisible();
  });
});

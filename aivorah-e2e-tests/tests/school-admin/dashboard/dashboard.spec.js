// School Admin Dashboard — Behavioral Audit. GET /school-admin/overview
// never existed on the ai-mentor monolith at all (only /admin/overview, a
// different Super-Admin-gated route) — every caller on SERVER_URL was
// silently 404ing. Read-only: admin-a is a shared, non-mutable account.
import { test, expect } from '@playwright/test';
import { applySession, statePath } from '../../helpers/auth.js';

export const REQUIRED_ACCOUNTS = ['admin-a'];

const READ_ACCOUNT = 'admin-a';

test.describe('School Admin Dashboard - Behavioral Audit', () => {
  test.use({ storageState: statePath(READ_ACCOUNT) });

  test.beforeEach(async ({ context, page }) => {
    await applySession(context, READ_ACCOUNT);
    await page.goto('/school-admin/dashboard');
  });

  test('loads real school data, not the empty-name fallback', async ({ page }) => {
    // '...' is the placeholder shown while overview is loading/unset — if the
    // fetch 404s (the pre-fix monolith behavior), this never resolves past it.
    await expect(page.getByText('...')).not.toBeVisible({ timeout: 15000 });
    await expect(page.getByText('The Shri Ram Academy').first()).toBeVisible({ timeout: 10000 });
  });
});

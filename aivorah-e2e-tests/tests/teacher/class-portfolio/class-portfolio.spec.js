// Class Portfolio (teacher-posted photos/videos with captions, likes,
// comments, tags — scoped to one grade+section) — Behavioral Audit.
// canViewClass grants any teacher/school_admin read access to any
// grade+section at their own school (not gated to the homeroom teacher),
// so this works even though teacher-a isn't assigned to a real class.
// Read-only: teacher-a is a shared, non-mutable account.
import { test, expect } from '@playwright/test';
import { applySession, statePath } from '../../helpers/auth.js';

export const REQUIRED_ACCOUNTS = ['teacher-a'];

const READ_ACCOUNT = 'teacher-a';

test.describe('Class Portfolio - Behavioral Audit (teacher)', () => {
  test.use({ storageState: statePath(READ_ACCOUNT) });

  test.beforeEach(async ({ context, page }) => {
    await applySession(context, READ_ACCOUNT);
    await page.goto('/my-classes/class?grade=Grade%201&section=A');
    await expect(page.getByPlaceholder('Search posts')).toBeVisible({ timeout: 15000 });
  });

  test('loads the portfolio feed or the empty state', async ({ page }) => {
    const feedOrEmpty = page.getByText('New post')
      .or(page.getByText('No posts match your filters.'));
    await expect(feedOrEmpty.first()).toBeVisible({ timeout: 10000 });
  });

  test('New post is hidden for a non-homeroom teacher (canViewClass grants read access, not manage)', async ({ page }) => {
    // teacher-a isn't the homeroom teacher for this arbitrary grade+section,
    // so the composer entry point must not render — confirm the negative
    // instead of skipping silently (same pattern as the Resources audit).
    await expect(page.getByText('New post')).not.toBeVisible();
  });
});

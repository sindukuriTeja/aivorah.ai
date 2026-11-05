// Channels (group/class chat rooms, Toddle-style) — Behavioral Audit.
// Read-only: teacher-a is a shared, non-mutable account — channel/message
// creation is only smoke-tested by opening/canceling, never submitted.
import { test, expect } from '@playwright/test';
import { applySession, statePath } from '../helpers/auth.js';

export const REQUIRED_ACCOUNTS = ['teacher-a'];

const READ_ACCOUNT = 'teacher-a';

test.describe('Channels - Behavioral Audit (teacher)', () => {
  test.use({ storageState: statePath(READ_ACCOUNT) });

  test.beforeEach(async ({ context, page }) => {
    await applySession(context, READ_ACCOUNT);
    await page.goto('/channels');
    await expect(page.getByText('Channels', { exact: true })).toBeVisible({ timeout: 15000 });
  });

  test('loads the channel list or the empty state', async ({ page }) => {
    const listOrEmpty = page.getByPlaceholder('Search for a chat or channel')
      .or(page.getByText('No channels yet.'));
    await expect(listOrEmpty.first()).toBeVisible({ timeout: 10000 });
  });

  test('search narrows results to a "nothing matches" empty state for a nonsense query', async ({ page }) => {
    await page.getByPlaceholder('Search for a chat or channel').fill('zzz-unmatched-query-xyz');
    await expect(page.getByText(/Nothing matches/)).toBeVisible({ timeout: 5000 });
    await page.getByPlaceholder('Search for a chat or channel').fill('');
  });

  test('selecting a channel (if any exist) shows its message thread', async ({ page }) => {
    const firstRow = page.getByText(/members/).first();
    const hasChannels = await firstRow.isVisible().catch(() => false);
    if (hasChannels) {
      await firstRow.click();
      await expect(page.getByText('Write a message…').or(page.getByText(/Only admins and teachers can send/))).toBeVisible({ timeout: 10000 });
    } else {
      await expect(page.getByText('Select a channel to view messages')).toBeVisible();
    }
  });
});

// Parent Settings: name/location edits, notification toggles, theme, Change
// Email validation, Delete Account validation, Sign Out. Change Password is
// covered by tests/parent/profile/profile.spec.js instead (same underlying
// flow) - not duplicated here.
//
// Uses parent-l (mutable, dedicated - see OWNERSHIP in accounts.js). Serial:
// handleSaveLocation's PATCH resends name alongside location, so it can race
// a concurrent name change; Sign Out must also run last.

import { test, expect } from '@playwright/test';
import { applySession, statePath } from '../../helpers/auth.js';
import { accountFor } from '../../helpers/accounts.js';
import { dismissAnnouncementIfPresent } from '../../helpers/dismissAnnouncement.js';

const ACCOUNT = 'parent-l';

export const REQUIRED_ACCOUNTS = ['parent-l'];

test.describe.configure({ mode: 'serial' });

test.describe('Parent Settings', () => {
  test.use({ storageState: statePath(ACCOUNT) });

  test.beforeEach(async ({ context, page }) => {
    await applySession(context, ACCOUNT);
    await page.goto('/');
    await dismissAnnouncementIfPresent(page);
    await page.getByText('Settings', { exact: true }).filter({ visible: true }).last().click();
    await expect(
      page.getByText('Profile & Account', { exact: true }).filter({ visible: true }).first(),
    ).toBeVisible({ timeout: 15000 });
  });

  test('changing the display name saves and persists on reload', async ({ page }) => {
    const newName = `E2E Parent L ${Date.now()}`;

    await page.getByText('Display Name', { exact: true }).filter({ visible: true }).first()
      .locator('xpath=../..').getByText('Change', { exact: true }).click();
    await expect(page.getByText('Change Display Name', { exact: true }).last()).toBeVisible({ timeout: 15000 });

    const nameInput = page.getByPlaceholder('Your name');
    await nameInput.fill(newName);

    const saveReq = page.waitForResponse((r) => /\/user\/sync/.test(r.url()) && r.request().method() === 'POST');
    await page.getByText('Save Changes', { exact: true }).last().click();
    await saveReq;

    await expect(page.getByText('Change Display Name', { exact: true })).toHaveCount(0, { timeout: 15000 });
    await expect(page.getByText(newName, { exact: true }).filter({ visible: true }).first()).toBeVisible();

    await page.reload();
    await dismissAnnouncementIfPresent(page);
    await page.getByText('Settings', { exact: true }).filter({ visible: true }).last().click();
    await expect(page.getByText(newName, { exact: true }).filter({ visible: true }).first())
      .toBeVisible({ timeout: 15000 });
  });

  test('updating location saves and persists on reload', async ({ page }) => {
    const newCity = `E2E City ${Date.now()}`;

    await page.getByText('Location', { exact: true }).filter({ visible: true }).first()
      .locator('xpath=../..').getByText('Update', { exact: true }).click();
    await expect(page.getByText('Location', { exact: true }).last()).toBeVisible({ timeout: 15000 });

    const cityInput = page.getByPlaceholder('e.g. Salem');
    await cityInput.fill(newCity);

    const saveReq = page.waitForResponse((r) => /\/user\/sync/.test(r.url()) && r.request().method() === 'POST');
    await page.getByText('Save', { exact: true }).last().click();
    await saveReq;

    // Alert.alert('Updated', ...) is a no-op on React Native Web (same reason
    // handleSignOut uses window.confirm instead) - nothing renders for it, so
    // don't wait on that text. The modal closing + the new city rendering are
    // the real, checkable signals that the save succeeded.
    await expect(page.getByText('Save', { exact: true })).toHaveCount(0, { timeout: 15000 });
    await expect(page.getByText(newCity, { exact: true }).filter({ visible: true }).first()).toBeVisible();

    await page.reload();
    await dismissAnnouncementIfPresent(page);
    await page.getByText('Settings', { exact: true }).filter({ visible: true }).last().click();
    await expect(page.getByText(newCity, { exact: true }).filter({ visible: true }).first())
      .toBeVisible({ timeout: 15000 });
  });

  test('toggling a notification preference persists across reload', async ({ page }) => {
    // RN Web renders the Switch as a real <input type="checkbox" role="switch">
    // with a `checked` DOM property, not an aria-checked attribute - use the
    // native checkbox matcher instead.
    const assignmentAlertsSwitch = page.getByRole('switch').first();
    const before = await assignmentAlertsSwitch.isChecked();

    await assignmentAlertsSwitch.click();
    if (before) await expect(page.getByRole('switch').first()).not.toBeChecked({ timeout: 5000 });
    else await expect(page.getByRole('switch').first()).toBeChecked({ timeout: 5000 });

    await page.reload();
    await dismissAnnouncementIfPresent(page);
    await page.getByText('Settings', { exact: true }).filter({ visible: true }).last().click();
    await expect(
      page.getByText('Profile & Account', { exact: true }).filter({ visible: true }).first(),
    ).toBeVisible({ timeout: 15000 });

    const afterReload = page.getByRole('switch').first();
    if (before) await expect(afterReload).not.toBeChecked({ timeout: 10000 });
    else await expect(afterReload).toBeChecked({ timeout: 10000 });

    // Revert so this test is repeatable and doesn't leave the account in a
    // flipped state for the next run.
    await afterReload.click();
  });

  test('switching theme persists across reload', async ({ page }) => {
    // .last() among visible matches, not .first() - RN Web keeps a duplicate
    // layout copy in the DOM, same as this suite's sidebar-nav locators.
    const lightOption = page.getByText('Light', { exact: true }).filter({ visible: true }).last();
    await lightOption.locator('xpath=..').click();
    await expect.poll(() => page.evaluate(() => localStorage.getItem('@ai_mentor_theme'))).toBe('light');

    await page.reload();
    await dismissAnnouncementIfPresent(page);
    await page.getByText('Settings', { exact: true }).filter({ visible: true }).last().click();
    await expect(page.evaluate(() => localStorage.getItem('@ai_mentor_theme'))).resolves.toBe('light');

    const autoOption = page.getByText('Auto', { exact: true }).filter({ visible: true }).last();
    await autoOption.locator('xpath=..').click();
  });

  test('Change Email validation: empty, invalid, and same-as-current email are all rejected before any request fires', async ({ page }) => {
    await page.getByText('Email Address', { exact: true }).filter({ visible: true }).first()
      .locator('xpath=../..').getByText('Change', { exact: true }).click();
    await expect(page.getByText('Change Email Address', { exact: true }).last()).toBeVisible({ timeout: 15000 });

    // Empty email.
    await page.getByText('Send Verification Code', { exact: true }).last().click();
    await expect(page.getByText('Please enter your new email.', { exact: true })).toBeVisible({ timeout: 5000 });

    // Invalid format.
    await page.getByPlaceholder('new@example.com').fill('not-an-email');
    await page.getByText('Send Verification Code', { exact: true }).last().click();
    await expect(page.getByText('Please enter a valid email address.', { exact: true })).toBeVisible({ timeout: 5000 });

    // Same as current.
    const currentEmail = accountFor(ACCOUNT).email;
    await page.getByPlaceholder('new@example.com').fill(currentEmail);
    await page.getByText('Send Verification Code', { exact: true }).last().click();
    await expect(page.getByText('That is already your current email.', { exact: true })).toBeVisible({ timeout: 5000 });

    await page.getByText('Cancel', { exact: true }).last().click();
    await expect(page.getByText('Change Email Address', { exact: true })).toHaveCount(0, { timeout: 10000 });
  });

  test('Delete Account modal requires a password and can be cancelled without deleting anything', async ({ page }) => {
    await page.getByText('Delete Account', { exact: true }).filter({ visible: true }).first().click();
    await expect(page.getByText('Delete Account?', { exact: true })).toBeVisible({ timeout: 15000 });

    // Confirm with an empty password field - blocked client-side, no request fires.
    await page.getByText('Delete', { exact: true }).last().click();
    await expect(page.getByText('Please enter your password to confirm.', { exact: true })).toBeVisible({ timeout: 5000 });

    await page.getByText('Cancel', { exact: true }).last().click();
    await expect(page.getByText('Delete Account?', { exact: true })).toHaveCount(0, { timeout: 10000 });

    // Still logged in and on Settings - proves nothing was deleted.
    await expect(
      page.getByText('Profile & Account', { exact: true }).filter({ visible: true }).first(),
    ).toBeVisible();
  });

  test('Sign Out logs the account out and returns to the login screen', async ({ page }) => {
    page.once('dialog', (d) => d.accept());
    await page.getByText('Sign Out', { exact: true }).filter({ visible: true }).first().click();

    await expect(page.frameLocator('iframe').getByRole('button', { name: 'Login' }))
      .toBeVisible({ timeout: 15000 });
  });
});

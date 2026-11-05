// Bug 1 (reset-password email not arriving) — E2E coverage.
//
// RCA (confirmed in ai-mentor/server, see services/mailer.js /
// routes/parent.js "POST /:parentEmail/children/:childId/reset-password"):
// sendPasswordResetEmail() used to swallow ALL email-provider failures with a
// console.warn and resolve anyway, so the route always returned
// { ok: true } to the frontend regardless of whether the email actually
// sent. Fixed by letting the failure propagate so the route's existing
// try/catch returns a real 500.
//
// Real email delivery can't be asserted from Playwright (no test-inbox
// mechanism exists in this repo, confirmed via a repo-wide search) - so this
// spec verifies the CONTRACT the fix depends on: the UI must only show the
// "Reset Link Sent" success state when the backend genuinely reports
// success, and must show an error (not a false success) when it doesn't.
// The real-success path hits the live backend for real; the failure path
// intercepts the network response to deterministically simulate a
// provider-down 500, since a live provider outage can't be reproduced on
// demand in CI.
//
// Uses parent-j (see OWNERSHIP in accounts.js) - same account/pattern as
// my-kids.spec.js. Creates its own throwaway child so it doesn't collide
// with other specs' use of student-b.

import { test, expect } from '@playwright/test';
import { applySession, statePath } from '../../helpers/auth.js';
import { dismissAnnouncementIfPresent } from '../../helpers/dismissAnnouncement.js';

const ACCOUNT = 'parent-j';
const BACKEND = process.env.E2E_BACKEND_URL || 'https://aivorah.ai';

function childrenUrl(parentEmail) {
  return `${BACKEND}/parent/${encodeURIComponent(parentEmail)}/children`;
}

async function listChildren(parentEmail) {
  const res = await fetch(childrenUrl(parentEmail));
  if (!res.ok) throw new Error(`could not list children: ${res.status}`);
  return res.json();
}

async function unlinkChildByName(parentEmail, childName) {
  for (const child of await listChildren(parentEmail)) {
    if (child.name === childName) {
      await fetch(`${childrenUrl(parentEmail)}/${child.id}`, { method: 'DELETE' });
    }
  }
}

async function createChildAndOpenCreds(page, childName) {
  await page.getByText('Add Child', { exact: true }).filter({ visible: true }).first().click();
  await expect(page.getByText('Add Child Account', { exact: true })).toBeVisible({ timeout: 10000 });

  await page.getByPlaceholder("Child's full name *").fill(childName);
  await page.getByText('CBSE', { exact: true }).filter({ visible: true }).first().click();
  await page.getByText('Grade 3', { exact: true }).filter({ visible: true }).first().click();
  await page.getByText('Create Student Account', { exact: true }).filter({ visible: true }).first().click();

  await expect(page.getByText(`${childName}'s login details`, { exact: true })).toBeVisible({ timeout: 20000 });
  await page.getByText("Got it, I've saved these", { exact: true }).filter({ visible: true }).first().click();

  // "Login Info" quick action on the child card re-opens the credentials
  // modal (where "Reset Child's Password" lives) - confirmed via
  // ChildCard.tsx:93/97.
  const card = page.getByText(childName, { exact: true }).filter({ visible: true }).first();
  await expect(card).toBeVisible({ timeout: 10000 });
  await page.getByText('Login Info', { exact: true }).filter({ visible: true }).first().click();
  await expect(page.getByText(`${childName}'s credentials`, { exact: true })).toBeVisible({ timeout: 10000 });
}

test.describe('Parent My Kids — reset child password (Bug 1)', () => {
  test.use({ storageState: statePath(ACCOUNT) });

  test.beforeEach(async ({ context, page }) => {
    await applySession(context, ACCOUNT);
    await page.goto('/');
    await expect(page.getByText('My Children', { exact: true })).toBeVisible({ timeout: 15000 });
    await dismissAnnouncementIfPresent(page);
    await page.getByText('My Kids', { exact: true }).last().click();
    await expect(page.getByText('Add Child', { exact: true }).filter({ visible: true }).first()).toBeVisible({ timeout: 15000 });
  });

  test('shows the success state only when the backend genuinely confirms the email was sent', async ({ page }) => {
    const childName = `E2E Reset OK ${Date.now()}`;
    try {
      await createChildAndOpenCreds(page, childName);

      const resetStatuses = [];
      page.on('response', async r => {
        if (/\/reset-password$/.test(r.url()) && r.request().method() === 'POST') {
          resetStatuses.push(r.status());
        }
      });

      await page.getByText("Reset Child's Password", { exact: true }).filter({ visible: true }).first().click();

      await expect.poll(() => resetStatuses.length, { timeout: 20000 }).toBeGreaterThan(0);
      expect(resetStatuses[0], 'real backend reset-password call should succeed for a real linked child').toBe(200);

      // Success state driven purely by the confirmed 200 - never shown before
      // the response lands (button shows a spinner while resettingPassword is true).
      await expect(page.getByText('Reset Link Sent to Your Email!', { exact: true })).toBeVisible({ timeout: 10000 });
    } finally {
      await unlinkChildByName(process.env.E2E_PARENT_J, childName);
    }
  });

  test('does NOT show the success state when the backend/email-provider call fails', async ({ page }) => {
    const childName = `E2E Reset Fail ${Date.now()}`;
    try {
      await createChildAndOpenCreds(page, childName);

      // Deterministically simulate a provider-down / delivery failure - this
      // is exactly the scenario Bug 1's fix targets: services/mailer.js used
      // to swallow this and the route returned 200 anyway.
      await page.route('**/reset-password', route =>
        route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Could not send reset email. Please try again.' }),
        })
      );

      let dialogMessage = '';
      page.once('dialog', async d => { dialogMessage = d.message(); await d.accept(); });

      await page.getByText("Reset Child's Password", { exact: true }).filter({ visible: true }).first().click();

      await expect.poll(() => dialogMessage, { timeout: 15000 }).toContain('Could not send reset email');

      // Must still show the original "try again" state, never the success state,
      // for a failed send - this is the UI-level contract the fix protects.
      await expect(page.getByText("Reset Child's Password", { exact: true })).toBeVisible({ timeout: 5000 });
      await expect(page.getByText('Reset Link Sent to Your Email!', { exact: true })).toHaveCount(0);
    } finally {
      await unlinkChildByName(process.env.E2E_PARENT_J, childName);
    }
  });
});

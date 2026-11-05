// Feature: Parent "My Kids" (ParentMyKidsScreen.tsx, currently in
// aivorah-frontend/src/.legacy-screens/parent/ - not yet refactored).
//
// Confirmed via code read:
//   - Backend is 100% ai-mentor/server monolith (routes/parent.js), no
//     dedicated microservice for this feature yet.
//   - "Create New": client-side Firebase createUserWithEmailAndPassword ->
//     optional OTP verify (only if a real child email is entered) ->
//     POST /parent/:email/children/init-auth -> POST
//     /parent/:email/children/link-created. Credentials are emailed to the
//     parent, and to the child too if a real (non-placeholder) email was
//     given. Email is optional - left blank, the backend auto-generates one.
//   - "Link Existing": POST /parent/:parentEmail/children { childEmail } -
//     looks up an existing student by email, 404s if not found, 409s if
//     already linked, else inserts a parent_children row.
//   - No testIDs anywhere in this screen - pure text/placeholder selectors.
//
// Uses parent-j (mutable, dedicated - see OWNERSHIP in accounts.js).
//
// "Link Existing" targets student-b's real, already-registered email.
// student-b is owned by student/dashboard.spec.js for its display
// name/profile photo - linking/unlinking it to a SECOND parent only touches
// the parent_children join table, not student-b's own profile fields, so
// this is safe to share (same reasoning other specs use for shared
// read-only-ish accounts). Unlinked again in this spec's own cleanup so the
// account's state doesn't drift across runs.

import { test, expect } from '@playwright/test';
import { applySession, statePath } from '../../helpers/auth.js';
import { accountFor } from '../../helpers/accounts.js';
import { dismissAnnouncementIfPresent } from '../../helpers/dismissAnnouncement.js';
const ACCOUNT = 'parent-j';

// Setup/cleanup goes through the backend's OWN API, not a direct Supabase
// write. Confirmed the hard way: SUPABASE_URL (the project the tests hold a
// service key for) is NOT the project the deployed backend at aivorah.ai
// reads and writes. Direct-DB unlinks therefore deleted nothing the backend
// could see, the stale parent_children row survived every run, and the link
// POST kept coming back 409 "This child is already linked to your account."
// while the test's own DB query showed zero rows. The backend already
// exposes exactly the two endpoints needed, so use those - they are true by
// construction whichever database is behind them.
const BACKEND = process.env.E2E_BACKEND_URL || 'https://aivorah.ai';

function childrenUrl(parentEmail) {
  return `${BACKEND}/parent/${encodeURIComponent(parentEmail)}/children`;
}

async function listChildren(parentEmail) {
  const res = await fetch(childrenUrl(parentEmail));
  if (!res.ok) throw new Error(`could not list children: ${res.status}`);
  return res.json();
}

// Unlinks by email, case-insensitively (the backend lowercases the email when
// it looks a child up, so the test must not be stricter than the backend).
// Returns the emails still linked afterwards, for failure diagnostics.
async function unlinkChildByEmail(parentEmail, childEmail) {
  const target = String(childEmail || '').trim().toLowerCase();
  for (const child of await listChildren(parentEmail)) {
    if (String(child.email || '').trim().toLowerCase() === target) {
      await fetch(`${childrenUrl(parentEmail)}/${child.id}`, { method: 'DELETE' });
    }
  }
  return (await listChildren(parentEmail)).map(c => c.email);
}

async function unlinkChildByName(parentEmail, childName) {
  for (const child of await listChildren(parentEmail)) {
    if (child.name === childName) {
      await fetch(`${childrenUrl(parentEmail)}/${child.id}`, { method: 'DELETE' });
    }
  }
}

test.describe('Parent My Kids', () => {
  test.use({ storageState: statePath(ACCOUNT) });

  test.beforeEach(async ({ context, page }) => {
    await applySession(context, ACCOUNT);
    await page.goto('/');
    await expect(page.getByText('My Children', { exact: true })).toBeVisible({ timeout: 15000 });
    await dismissAnnouncementIfPresent(page);

    // Sidebar "My Kids" link, under MENU.
    await page.getByText('My Kids', { exact: true }).last().click();
    await expect(page.getByText('Add Child', { exact: true }).filter({ visible: true }).first()).toBeVisible({ timeout: 15000 });
  });

  test('creates a new student account via Create New', async ({ page }) => {
    // Unique name per run so the backend's duplicate-child (same name+grade)
    // check never collides across repeated test runs.
    const childName = `E2E Kid ${Date.now()}`;

    await page.getByText('Add Child', { exact: true }).filter({ visible: true }).first().click();
    await expect(page.getByText('Add Child Account', { exact: true })).toBeVisible({ timeout: 10000 });

    // "Create New" tab is the default - just fill the form.
    await page.getByPlaceholder("Child's full name *").fill(childName);
    // Email left blank on purpose - exercises the auto-generated-email path.
    await page.getByPlaceholder('School name (optional)').fill('Apsham');

    // Curriculum and Grade are required chip selectors, not native <select>s
    // (createStudent() blocks with "Please select a curriculum/grade" if
    // skipped - confirmed via ParentMyKidsScreen.tsx:404-405). Grade options
    // only render after a curriculum is picked.
    await page.getByText('CBSE', { exact: true }).filter({ visible: true }).first().click();
    await page.getByText('Grade 3', { exact: true }).filter({ visible: true }).first().click();

    await page.getByText('Create Student Account', { exact: true }).filter({ visible: true }).first().click();

    // Success: creation triggers a credentials modal ("<name>'s login
    // details") BEFORE the list updates - confirmed via a failure snapshot
    // showing this dialog blocking the assertion. Close it first.
    await expect(page.getByText(`${childName}'s login details`, { exact: true })).toBeVisible({ timeout: 20000 });
    await page.getByText("Got it, I've saved these", { exact: true }).filter({ visible: true }).first().click();

    // Now the new child's name appears in the My Kids list.
    await expect(page.getByText(childName, { exact: true }).filter({ visible: true }).first()).toBeVisible({ timeout: 10000 });

    // Cleanup through the backend's own API rather than the UI's remove flow
    // (the exact DOM ancestor for this specific child's remove button proved
    // too fragile under RN Web's duplicate mobile/desktop rendering) and
    // rather than a direct DB delete (the test's Supabase project is not the
    // one the backend uses - see the note at the top of this file). The
    // assertions above already prove the feature works; this just stops
    // repeated runs from piling children up on the account.
    await unlinkChildByName(process.env.E2E_PARENT_J, childName);
  });

  test('links an existing student account via Link Existing', async ({ page }) => {
    const studentEmail = process.env.E2E_STUDENT_B;
    // Defensive: start from a known-unlinked state, in case a previous run's
    // cleanup didn't complete - otherwise the link POST 409s "already linked".
    const linkedBefore = await unlinkChildByEmail(process.env.E2E_PARENT_J, studentEmail);

    // try/finally: if an assertion fails the unlink MUST still run, or the
    // leftover link poisons every later run (exactly how this test got stuck).
    try {
      await page.getByText('Add Child', { exact: true }).filter({ visible: true }).first().click();
      await expect(page.getByText('Add Child Account', { exact: true })).toBeVisible({ timeout: 10000 });

      await page.getByText('Link Existing', { exact: true }).filter({ visible: true }).first().click();
      await page.getByPlaceholder('child@example.com').fill(studentEmail);

      // Assert on the real POST /parent/:email/children response rather than
      // inferring from the DOM: addChild() only closes the modal on a 2xx, so
      // a still-open modal gave a useless "modal is visible" failure with no
      // indication of WHY (404 vs 409 vs 500). Every matching POST is
      // recorded, not just the first, so a duplicate submit - which always
      // 409s once the first insert lands - can't be mistaken for a failure.
      const linkStatuses = [];
      page.on('response', async r => {
        if (/\/parent\/[^/]+\/children(\?|$)/.test(r.url()) && r.request().method() === 'POST') {
          linkStatuses.push(`${r.status()} ${await r.text().catch(() => '<unreadable>')}`);
        }
      });

      await page.getByText('Link Account', { exact: true }).filter({ visible: true }).first().click();
      await expect.poll(() => linkStatuses.length, { timeout: 20000 }).toBeGreaterThan(0);
      expect(
        linkStatuses.some(s => s.startsWith('200')),
        `link request failed: ${JSON.stringify(linkStatuses)} ` +
          `(children linked before this test: ${JSON.stringify(linkedBefore)})`
      ).toBe(true);

      // Modal closes on success - it unmounts, so count 0 sidesteps the RN Web
      // duplicate-node visibility trap that made not.toBeVisible() flaky here.
      await expect(page.getByText('Add Child Account', { exact: true })).toHaveCount(0, { timeout: 15000 });

      // ...and the student now shows up in the My Kids list. The card renders
      // the child's display NAME, not the email (confirmed by a failure where
      // the email text appeared nowhere in the DOM), so ask the backend for
      // the name of the child it just linked rather than hardcoding it.
      const linkedChild = (await listChildren(process.env.E2E_PARENT_J)).find(
        c => String(c.email || '').toLowerCase() === String(studentEmail).toLowerCase()
      );
      expect(
        linkedChild,
        `${studentEmail} is not among the parent's children after linking`
      ).toBeTruthy();
      await expect(
        page.getByText(linkedChild.name, { exact: true }).filter({ visible: true }).first()
      ).toBeVisible({ timeout: 15000 });
    } finally {
      await unlinkChildByEmail(process.env.E2E_PARENT_J, studentEmail);
    }
  });

  test('shows an error when linking a non-existent email', async ({ page }) => {
    await page.getByText('Add Child', { exact: true }).filter({ visible: true }).first().click();
    await expect(page.getByText('Add Child Account', { exact: true })).toBeVisible({ timeout: 10000 });

    await page.getByText('Link Existing', { exact: true }).filter({ visible: true }).first().click();
    await page.getByPlaceholder('child@example.com').fill('no-such-student-e2e@aivorah.test');
    await page.getByText('Link Account', { exact: true }).filter({ visible: true }).first().click();

    await expect(page.getByText(/No student found with that email/i)).toBeVisible({ timeout: 15000 });
  });
});

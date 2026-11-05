// Feature: Parent "Parental Controls"
// (aivorah-frontend/src/screens/parent/parental-controls/ParentControlsScreen.tsx
// - refactored out of legacy 2026-09-03).
//
// Confirmed via code read:
//   - Backend is aivorah-parental-controls-service (extracted from the
//     ai-mentor monolith's routes/parent.js 2026-09-03 - same routes/shapes):
//       POST/GET /parent/:parentEmail/children/:childId/screen-time
//     Children list still comes from aivorah-students-service (same Dev DB
//     project, so child ids line up with what this service's
//     parent_children checks expect - see getChildIdByParentEmailFromStudentsService).
//   - The screen auto-saves 800ms after any control changes (no explicit
//     Save needed to persist), and also exposes an explicit "Save All
//     Settings" button - this spec uses the explicit button so save timing
//     doesn't race the assertions.
//   - No testIDs anywhere in this screen - pure text/switch selectors, same
//     convention as My Kids / Daily Tasks.
//
// Uses parent-b (mutable, dedicated - see OWNERSHIP in accounts.js: "parent
// controls tests, writes to student-e"). Linked via a parent_children row
// seeded directly in the Dev DB (2026-09-03, alongside the service
// migration) - this spec never links/unlinks, only mutates the screen_time
// fields on student-e's user_preferences row, which no other spec touches
// (see accounts.js).
//
// Each test writes its OWN full control payload before asserting (rather
// than relying on a shared beforeEach baseline), and resets to a disabled
// baseline in afterEach - so tests are independent of run order and safe
// if Playwright ever runs them out of order. Files run in parallel across
// workers (this file owns student-e exclusively); tests inside this file
// run serially by default, which is fine since they share one child row.

import { test, expect } from '@playwright/test';
import { applySession, statePath } from '../../helpers/auth.js';
import { accountFor } from '../../helpers/accounts.js';
import { getChildIdByParentEmailFromStudentsService, PARENTAL_CONTROLS_SERVICE_URL } from '../../helpers/api.js';
import { dismissAnnouncementIfPresent } from '../../helpers/dismissAnnouncement.js';

const ACCOUNT = 'parent-b';

// See scripts/run-scoped-spec.mjs's header comment for the convention.
// Includes parent-h (read-only) - used by the 403 authorization test below.
export const REQUIRED_ACCOUNTS = ['parent-b', 'student-e', 'parent-h'];

function screenTimeUrl(parentEmail, childId) {
  return `${PARENTAL_CONTROLS_SERVICE_URL}/parent/${encodeURIComponent(parentEmail)}/children/${childId}/screen-time`;
}

// Waits for the actual screen-time POST's response, rather than the
// "Settings saved" toast text - that Text node is ALWAYS present in the DOM
// (Animated.Value drives its opacity from 0, it's never display:none), and
// Playwright's visibility check doesn't consider CSS opacity, only layout -
// so `.toBeVisible()` on it passes immediately regardless of whether a save
// actually happened yet (confirmed via a debug run: the assertion passed
// with zero POSTs having fired). This is the only real signal that the
// 800ms-debounced auto-save actually landed.
function waitForScreenTimeSave(page) {
  return page.waitForResponse(
    (r) => /\/screen-time$/.test(r.url()) && r.request().method() === 'POST',
    { timeout: 10000 },
  );
}

async function resetControls(request, parentEmail, childId) {
  await request.post(screenTimeUrl(parentEmail, childId), {
    data: {
      dailyLimitMinutes: 60, enabled: false, lockWhenReached: false,
      weeklyCapEnabled: false, weeklyCapMinutes: 300,
      allowedHoursEnabled: false, allowedHoursStart: 14, allowedHoursEnd: 21,
      breakEnforcerEnabled: false, breakIntervalMinutes: 25, breakDurationMinutes: 5,
      homeworkFirstEnabled: false,
      subjectFilterEnabled: false, blockedSubjects: [],
    },
  });
}

test.describe('Parent Parental Controls', () => {
  test.use({ storageState: statePath(ACCOUNT) });

  // fullyParallel: true (playwright.config.js) runs every test in its own
  // worker by default, including tests within this same file. Each test
  // here Saves the FULL screen_time payload built from whatever its own
  // page loaded at screen-open time - two tests racing on student-e would
  // each overwrite the other's just-saved field with stale local state
  // (same class of bug confirmed and fixed in
  // parental-controls-enforcement.spec.js). Force serial execution.
  test.describe.configure({ mode: 'serial' });

  let childId;

  test.beforeAll(async ({ request }) => {
    const parentEmail = accountFor(ACCOUNT).email;
    const studentEmail = accountFor('student-e').email;
    childId = await getChildIdByParentEmailFromStudentsService(request, { parentEmail, childEmail: studentEmail });
    await resetControls(request, parentEmail, childId);
  });

  test.afterEach(async ({ request }) => {
    await resetControls(request, accountFor(ACCOUNT).email, childId);
  });

  test.beforeEach(async ({ context, page }) => {
    await applySession(context, ACCOUNT);
    await page.goto('/');
    await dismissAnnouncementIfPresent(page);
    // Sidebar "Parental Controls" link. Plain .last() (My Kids/Daily Tasks'
    // convention) isn't enough here - DrawerContent.tsx has its OWN, stale
    // duplicate of the parent nav items (confirmed via a code read: it still
    // groups Parental Controls under SYSTEM alongside Settings/Help Centre,
    // an older structure Sidebar.tsx has since moved on from) and renders
    // BEFORE Sidebar.tsx in the DOM, adding a 3rd "Parental Controls" text
    // node ahead of Sidebar's own collapsed+overlay pair. Filter to visible
    // nodes first, then .last() - the overlay copy (proven-clickable per
    // My Kids/Daily Tasks) is last among VISIBLE matches.
    await page.getByText('Parental Controls', { exact: true }).filter({ visible: true }).last().click();
    await expect(page.getByText('USAGE OVERVIEW', { exact: false }).filter({ visible: true }).first())
      .toBeVisible({ timeout: 15000 });
  });

  // ControlRow renders each toggle as a real role="switch" element, in a
  // fixed DOM order matching the visual layout (confirmed via a live
  // accessibility-tree read): Daily Limit(0), Weekly Cap(1), Allowed
  // Hours(2), Break Enforcer(3), Subject Filter(4). Climbing from the label
  // text to a shared ancestor div (tried first) was fragile - RN Web's
  // nesting here doesn't put the label and its Switch under a single
  // ancestor div at a fixed level, so the ancestor query silently matched
  // nothing and every click timed out. Indexing the switch directly is
  // exact and immune to that nesting.
  // Click the explicit "Save All Settings" button (its onPress calls
  // saveSettings() directly, no debounce) rather than relying on the
  // screen's OWN 800ms-debounced auto-save - that debounce effect turned
  // out to be unreliable under fast automated interaction (confirmed via a
  // debug run: the toggle visibly took effect in the UI, but zero
  // screen-time POSTs ever fired within a 10s window - a real, separate bug
  // in the debounce/StrictMode interaction, not something worth working
  // around here). waitForScreenTimeSave() confirms the explicit save's own
  // real POST landed, rather than trusting the "Settings saved" toast text -
  // that Text node is ALWAYS in the DOM (Animated.Value drives its opacity
  // from 0, never display:none) and Playwright's visibility check ignores
  // CSS opacity, so `.toBeVisible()` on it passed instantly regardless of
  // whether a save had actually happened yet.
  const saveButton = (page) => page.getByText('Save All Settings', { exact: true }).filter({ visible: true }).first();

  test('enabling Daily Limit persists across reload', async ({ page, request }) => {
    await page.getByRole('switch').nth(0).click();
    // Row expands once enabled - "Lock app when limit is reached" only
    // renders inside the expanded body.
    await expect(page.getByText('Lock app when limit is reached', { exact: true }).filter({ visible: true }).first())
      .toBeVisible({ timeout: 10000 });

    const saved = waitForScreenTimeSave(page);
    await saveButton(page).click();
    await saved;

    const res = await request.get(screenTimeUrl(accountFor(ACCOUNT).email, childId));
    expect((await res.json()).isEnabled).toBe(true);

    await page.reload();
    await dismissAnnouncementIfPresent(page);
    await expect(page.getByText('Lock app when limit is reached', { exact: true }).filter({ visible: true }).first())
      .toBeVisible({ timeout: 15000 });
  });

  test('enabling Weekly Cap persists', async ({ page, request }) => {
    await page.getByRole('switch').nth(1).click();
    const saved = waitForScreenTimeSave(page);
    await saveButton(page).click();
    await saved;

    const res = await request.get(screenTimeUrl(accountFor(ACCOUNT).email, childId));
    const data = await res.json();
    expect(data.weeklyCapEnabled).toBe(true);
    expect(data.weeklyCapMinutes).toBe(300);
  });

  test('enabling Allowed Hours persists the default window', async ({ page, request }) => {
    await page.getByRole('switch').nth(2).click();
    const saved = waitForScreenTimeSave(page);
    await saveButton(page).click();
    await saved;

    const res = await request.get(screenTimeUrl(accountFor(ACCOUNT).email, childId));
    const data = await res.json();
    expect(data.allowedHoursEnabled).toBe(true);
    expect(data.allowedHoursStart).toBe(14);
    expect(data.allowedHoursEnd).toBe(21);
  });

  test('enabling Break Enforcer persists', async ({ page, request }) => {
    await page.getByRole('switch').nth(3).click();
    const saved = waitForScreenTimeSave(page);
    await saveButton(page).click();
    await saved;

    const res = await request.get(screenTimeUrl(accountFor(ACCOUNT).email, childId));
    const data = await res.json();
    expect(data.breakEnforcerEnabled).toBe(true);
    expect(data.breakIntervalMinutes).toBe(25);
    expect(data.breakDurationMinutes).toBe(5);
  });

  test('blocking a subject via Subject Filter persists', async ({ page, request }) => {
    await page.getByRole('switch').nth(4).click();
    // Subject chips only render once the row is enabled.
    const mathsChip = page.getByText('Mathematics', { exact: true }).filter({ visible: true }).first();
    await expect(mathsChip).toBeVisible({ timeout: 10000 });
    await mathsChip.click();
    await expect(page.getByText('1 subject blocked', { exact: true }).filter({ visible: true }).first())
      .toBeVisible({ timeout: 10000 });

    const saved = waitForScreenTimeSave(page);
    await saveButton(page).click();
    await saved;

    const res = await request.get(screenTimeUrl(accountFor(ACCOUNT).email, childId));
    const data = await res.json();
    expect(data.subjectFilterEnabled).toBe(true);
    expect(data.blockedSubjects).toContain('Mathematics');
  });

  test('parent not linked to a child gets 403 from the screen-time API', async ({ request }) => {
    const outsiderParentEmail = accountFor('parent-h').email; // read-only, zero linked children
    const res = await request.get(screenTimeUrl(outsiderParentEmail, childId));
    expect(res.status()).toBe(403);
  });
});

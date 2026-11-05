// Feature: Parent "Daily Tasks" (aivorah-frontend/src/screens/parent/
// daily-tasks/ParentDailyTasksScreen.tsx - just refactored out of
// .legacy-screens/parent/).
//
// Confirmed via code read:
//   - Children list: GET {BACKEND}/parent/:email/children - still monolith
//     (ai-mentor/server routes/parent.js), no dedicated parent/children
//     microservice exists yet.
//   - Tasks: GET/POST/DELETE {DAILY_HABITS_SERVICE_URL}/habits/parent-tasks
//     - repointed to aivorah-daily-habits-service, which already had
//     matching routes/shapes (confirmed via a routes+services code read
//     side by side with the frontend's fetch calls - no backend changes
//     needed).
//   - No testIDs on this screen - pure text/placeholder selectors, same as
//     the My Kids screen this spec borrows conventions from.
//
// Uses parent-k (mutable, dedicated - see OWNERSHIP in accounts.js). A
// freshly provisioned account with no children linked, so this spec links
// student-b to it via the backend's own API before testing (same
// reasoning as my-kids.spec.js: student-b's own profile fields are never
// touched, only the parent_children join table), and unlinks in cleanup.

import { test, expect } from '@playwright/test';
import { applySession, statePath } from '../../helpers/auth.js';
import { dismissAnnouncementIfPresent } from '../../helpers/dismissAnnouncement.js';

const ACCOUNT = 'parent-k';

// Setup/cleanup for the parent-child link goes through the monolith's own
// API, not a direct Supabase write - same hard-won lesson as my-kids.spec.js
// (the test's SUPABASE_URL is not the project the deployed backend at
// aivorah.ai reads/writes for the children join table).
const BACKEND = process.env.E2E_BACKEND_URL || 'https://aivorah.ai';
const HABITS_SERVICE = process.env.DAILY_HABITS_SERVICE_URL || 'https://aivorah-daily-habits-service.onrender.com';

function childrenUrl(parentEmail) {
  return `${BACKEND}/parent/${encodeURIComponent(parentEmail)}/children`;
}

async function listChildren(parentEmail) {
  const res = await fetch(childrenUrl(parentEmail));
  if (!res.ok) throw new Error(`could not list children: ${res.status}`);
  return res.json();
}

async function linkChildByEmail(parentEmail, childEmail) {
  await fetch(childrenUrl(parentEmail), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ childEmail }),
  });
  return (await listChildren(parentEmail)).find(
    c => String(c.email || '').toLowerCase() === String(childEmail).toLowerCase()
  );
}

async function unlinkChildByEmail(parentEmail, childEmail) {
  const target = String(childEmail || '').trim().toLowerCase();
  for (const child of await listChildren(parentEmail)) {
    if (String(child.email || '').trim().toLowerCase() === target) {
      await fetch(`${childrenUrl(parentEmail)}/${child.id}`, { method: 'DELETE' });
    }
  }
}

// Cleans up any leftover parent-assigned tasks for a child, directly via the
// daily-habits-service's own API - keeps the account's task list empty
// between runs regardless of which assertion (if any) failed.
async function clearTasks(childId) {
  const res = await fetch(`${HABITS_SERVICE}/habits/parent-tasks?childId=${childId}`);
  if (!res.ok) return;
  const tasks = await res.json();
  for (const t of tasks) {
    await fetch(`${HABITS_SERVICE}/habits/parent-tasks/${t.id}`, { method: 'DELETE' });
  }
}

test.describe('Parent Daily Tasks', () => {
  test.use({ storageState: statePath(ACCOUNT) });

  let child;

  test.beforeAll(async () => {
    const parentEmail = process.env.E2E_PARENT_K;
    const studentEmail = process.env.E2E_STUDENT_B;
    // Defensive: start unlinked in case a previous run's cleanup didn't
    // complete, then link fresh.
    await unlinkChildByEmail(parentEmail, studentEmail);
    child = await linkChildByEmail(parentEmail, studentEmail);
    if (!child) throw new Error('setup failed: could not link student-b to parent-k');
    await clearTasks(child.id);
  });

  test.afterAll(async () => {
    const parentEmail = process.env.E2E_PARENT_K;
    if (child) await clearTasks(child.id);
    await unlinkChildByEmail(parentEmail, process.env.E2E_STUDENT_B);
  });

  test.beforeEach(async ({ context, page }) => {
    await applySession(context, ACCOUNT);
    await page.goto('/');
    await dismissAnnouncementIfPresent(page);

    // Sidebar "Daily Tasks" link, under MENU. Uses .last() with no visible
    // filter - matches my-kids.spec.js's proven-working convention for
    // sidebar nav clicks. filter({visible:true}).first() was tried first
    // and consistently failed in CI: RN Web keeps the drawer's off-screen
    // copy in the DOM with a non-zero bounding box (so it still passes
    // Playwright's "visible" check), and .first() picked that copy, whose
    // ancestor then intercepted pointer events meant for the real sidebar
    // link underneath - 30s of "subtree intercepts pointer events" retries
    // confirmed this via a CI log read.
    await page.getByText('Daily Tasks', { exact: true }).last().click();
    await expect(page.getByText('SELECT CHILD', { exact: true }).filter({ visible: true }).first()).toBeVisible({ timeout: 15000 });
  });

  test('shows the linked child and an empty task list', async ({ page }) => {
    await expect(page.getByText(child.name, { exact: true }).filter({ visible: true }).first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('No tasks assigned yet. Add one below.', { exact: true }).filter({ visible: true }).first())
      .toBeVisible({ timeout: 15000 });
  });

  test('creates a new task and it appears in the list', async ({ page }) => {
    const label = `E2E task ${Date.now()}`;

    // Select the linked child's pill explicitly - the screen auto-selects
    // the first child, but be defensive in case the list order changes.
    await page.getByText(child.name, { exact: true }).filter({ visible: true }).first().click();

    await page.getByPlaceholder(`New task for ${child.name} (e.g. Read for 20 mins)`).fill(label);
    // Icon and coins default to 'check-circle' / '5' - no chip selection
    // required (unlike the curriculum/grade chips on My Kids), confirmed by
    // reading useDailyTasks/ParentDailyTasksScreen: addTask() only blocks on
    // an empty label or missing selected child.
    await page.getByText('Add Task', { exact: true }).filter({ visible: true }).first().click();

    await expect(page.getByText(label, { exact: true }).filter({ visible: true }).first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('5 coins', { exact: true }).filter({ visible: true }).first()).toBeVisible({ timeout: 10000 });
  });

  test('deletes a task', async ({ page }) => {
    const label = `E2E delete-me ${Date.now()}`;

    await page.getByText(child.name, { exact: true }).filter({ visible: true }).first().click();
    await page.getByPlaceholder(`New task for ${child.name} (e.g. Read for 20 mins)`).fill(label);
    await page.getByText('Add Task', { exact: true }).filter({ visible: true }).first().click();

    const taskLabel = page.getByText(label, { exact: true }).filter({ visible: true }).first();
    await expect(taskLabel).toBeVisible({ timeout: 15000 });

    // Delete via the trash icon in the task row. No testID exists, so climb
    // from the label to its row and click the row's trash button - the row
    // is the label's closest ancestor that also contains the icon wrap and
    // the delete affordance.
    const taskRow = page.locator('div', { has: page.getByText(label, { exact: true }) }).last();
    await taskRow.getByRole('button').last().click().catch(async () => {
      // Fallback: some RN Web builds don't expose trash icons as a11y
      // buttons - click the icon element directly instead.
      await taskRow.locator('svg, [data-testid*="trash"], [aria-label*="trash"]').last().click();
    });

    await expect(page.getByText(label, { exact: true })).toHaveCount(0, { timeout: 15000 });
  });
});

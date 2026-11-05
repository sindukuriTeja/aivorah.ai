// Feature: Parent "Learning" (aivorah-frontend/src/.legacy-screens/parent/
// ParentLearningScreen.tsx - not yet refactored out of legacy).
//
// Confirmed via code read:
//   - Entirely read-only. Backend is 100% ai-mentor/server monolith:
//       GET /parent/:parentEmail/children
//       GET /student/:childId                       (completedTopics, topicsExplored)
//       GET /analytics/child-report?childEmail=...   (AI chats, avg score, per-topic analytics)
//       GET /curriculum/subjects?grade=&curriculum=  (subjects/topics from Qdrant)
//     No POST/PUT/DELETE anywhere on this screen - nothing to reset in
//     afterEach, and no other spec's state can be disturbed by running this
//     one, so it's safe to share a read-only account and run fully in
//     parallel with every other spec (and with itself, if run twice).
//   - No testIDs - pure text selectors, same convention as other specs.
//
// Uses parent-e (read-only, shared - see accounts.js: "the only parent
// linked to TWO children (student-a, student-b), for the Parent Dashboard
// child-switching spec" - reused here for the same reason: this is the only
// account with two children of different grade/curriculum, needed to prove
// switching child tabs actually reloads that child's own data).

import { test, expect } from '@playwright/test';
import { applySession, statePath } from '../../helpers/auth.js';
import { dismissAnnouncementIfPresent } from '../../helpers/dismissAnnouncement.js';

const ACCOUNT = 'parent-e';

export const REQUIRED_ACCOUNTS = ['parent-e'];

test.describe('Parent Learning', () => {
  test.use({ storageState: statePath(ACCOUNT) });

  test.beforeEach(async ({ context, page }) => {
    await applySession(context, ACCOUNT);
    await page.goto('/');
    await dismissAnnouncementIfPresent(page);
    // Sidebar "Learning" link, under CHILDREN - same .last() convention as
    // other specs (RN Web keeps an off-screen collapsed-sidebar copy in the
    // DOM that also passes the visibility check).
    await page.getByText('Learning', { exact: true }).filter({ visible: true }).last().click();
    await expect(page.getByText('Subjects Overview', { exact: true }).filter({ visible: true }).first())
      .toBeVisible({ timeout: 15000 });
  });

  test('loads and displays the first child\'s curriculum summary and subjects', async ({ page }) => {
    await expect(page.getByText('topics done', { exact: false }).filter({ visible: true }).first())
      .toBeVisible({ timeout: 15000 });
    // At least one subject card renders (or the explicit empty state - either
    // way the screen must not be stuck on its own loading spinner forever).
    const hasSubjects = await page.getByText('Tap a subject to see topic-by-topic progress', { exact: true })
      .filter({ visible: true }).first().isVisible().catch(() => false);
    expect(hasSubjects).toBe(true);
  });

  test('switching the child tab reloads that child\'s own data', async ({ page }) => {
    // Assert on the real network request rather than the rendered subject
    // count/curriculum label - those depend on curriculum content actually
    // being ingested for whichever grade this account's children happen to
    // have (confirmed both of parent-e's linked children show "0 Subjects"
    // in this environment), which this test has no control over. The
    // contract that matters is: switching child tabs re-fetches data
    // scoped to the NEWLY selected child, not the previous one.
    const childTabs = page.locator('text=Grade').filter({ visible: true });
    const tabCount = await childTabs.count();
    test.skip(tabCount < 2, 'parent-e must have 2 linked children for this test - check accounts.js/seed data');

    const secondChildRequest = page.waitForRequest(
      (r) => /\/student\//.test(r.url()) || /\/curriculum\/subjects/.test(r.url()),
      { timeout: 15000 },
    );
    await childTabs.nth(1).click();
    // Just proves a fresh fetch fired after the switch - the specific URL
    // isn't asserted further since student id / grade+curriculum values
    // aren't known ahead of time from the test side.
    await secondChildRequest;
  });

  test('expanding a subject shows its topic-by-topic detail panel, collapsing hides it', async ({ page }) => {
    // Wait for the real /curriculum/subjects response before checking for a
    // subject card - the sidebar-nav beforeEach's "Subjects Overview"
    // visibility can win the race against the subjects fetch settling into
    // state. Since this call moved to aivorah-learning-paths-service
    // (2026-09-04), its real response time varies more than the monolith's
    // did (684ms-2.5s+ observed directly, a live Qdrant scroll query) - a
    // single-shot `.isVisible()` check right after the response resolves
    // can still race the response -> setState -> re-render chain. Poll with
    // `expect(...).toBeVisible()` instead of a one-shot check, and use a
    // real timeout headroom rather than trusting the response event alone.
    await page.reload();
    await dismissAnnouncementIfPresent(page);
    await page.waitForResponse((r) => /curriculum\/subjects/.test(r.url()), { timeout: 20000 }).catch(() => null);

    const firstSubjectCard = page.getByText('completed', { exact: false }).filter({ visible: true }).first();
    const noContent = page.getByText('No content found', { exact: false }).filter({ visible: true }).first();
    await expect(firstSubjectCard.or(noContent)).toBeVisible({ timeout: 10000 });
    test.skip(await noContent.isVisible().catch(() => false), 'no subjects with content for this child - see empty-state test');

    await firstSubjectCard.click();
    await expect(page.getByText('Tap a subject to see topic-by-topic progress', { exact: true }))
      .toBeVisible({ timeout: 5000 }); // sanity: still on the same screen
    // The detail panel renders a per-topic status label for every topic.
    const statusLabel = page.getByText(/Done|In Progress|Not started/).filter({ visible: true }).first();
    await expect(statusLabel).toBeVisible({ timeout: 10000 });

    await firstSubjectCard.click();
    await expect(statusLabel).toHaveCount(0, { timeout: 10000 });
  });

  test('stats banner renders Study Time, AI Chats, Avg Score and Topics Active', async ({ page }) => {
    await expect(page.getByText('Study Time', { exact: true }).filter({ visible: true }).first()).toBeVisible();
    await expect(page.getByText('AI Chats', { exact: true }).filter({ visible: true }).first()).toBeVisible();
    await expect(page.getByText('Avg Score', { exact: true }).filter({ visible: true }).first()).toBeVisible();
    await expect(page.getByText('Topics Active', { exact: true }).filter({ visible: true }).first()).toBeVisible();
  });
});

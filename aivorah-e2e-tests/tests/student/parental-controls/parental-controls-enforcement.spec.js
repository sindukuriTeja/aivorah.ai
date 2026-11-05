// Feature: Student-side enforcement of Parental Controls
// (aivorah-frontend/src/components/common/ScreenLayout.tsx polls GET
// /parent/screen-time-status/:studentEmail every 15s and renders a
// fullscreen lock overlay when a restriction is active - priority order
// confirmed via code read: locked > outside allowed hours > weekly cap >
// break).
//
// Each test sets ONLY the one restriction it verifies (every other field
// explicitly disabled in the same POST, not left over from a previous
// test), so overlay priority never leaks between tests and tests can run
// in any order. Restrictions are set directly via aivorah-parental-controls-
// service's API (POST /parent/:parentEmail/children/:childId/screen-time as
// parent-c) - extracted from the monolith 2026-09-03, same routes/shapes,
// now backed by the Dev DB Supabase project - not through the Parental
// Controls UI - that UI is already covered by
// tests/parent/parental-controls/parental-controls.spec.js; this file's
// job is only to verify the CHILD side reacts correctly to whatever the
// backend says.
//
// Uses parent-c/student-f (mutable, dedicated - see OWNERSHIP in
// accounts.js: "parent controls tests, writes to student-f"). Linked via a
// parent_children row seeded directly in the Dev DB (2026-09-03, alongside
// the service migration - the monolith's own link doesn't carry over, it's
// a different database). Resets to a fully-disabled baseline in afterEach so
// a failed assertion never leaves student-f locked for a later run.

import { test, expect } from '@playwright/test';
import { applySession, statePath } from '../../helpers/auth.js';
import { accountFor } from '../../helpers/accounts.js';
import { getChildIdByParentEmailFromStudentsService, PARENTAL_CONTROLS_SERVICE_URL } from '../../helpers/api.js';
import { dismissAnnouncementIfPresent } from '../../helpers/dismissAnnouncement.js';

const PARENT_ACCOUNT = 'parent-c';
const STUDENT_ACCOUNT = 'student-f';

// Declares exactly which tests/helpers/accounts.js keys this file needs -
// read by scripts/run-scoped-spec.mjs (via a static regex, NOT by
// importing this file - see that script's header comment for why) to
// seed/log-in ONLY these accounts for a local single-spec run instead of
// all ~90. Keep this a literal array of string literals, not identifiers -
// the scoping script does not evaluate JS, it pattern-matches this line.
// Optional: a spec with no REQUIRED_ACCOUNTS export just falls back to the
// full-suite setup, so this convention is opt-in and never breaks CI.
export const REQUIRED_ACCOUNTS = ['parent-c', 'student-f'];

const DISABLED_BASELINE = {
  dailyLimitMinutes: 60, enabled: false, lockWhenReached: false,
  weeklyCapEnabled: false, weeklyCapMinutes: 300,
  allowedHoursEnabled: false, allowedHoursStart: 14, allowedHoursEnd: 21,
  breakEnforcerEnabled: false, breakIntervalMinutes: 25, breakDurationMinutes: 5,
  homeworkFirstEnabled: false,
  subjectFilterEnabled: false, blockedSubjects: [],
};

function screenTimeUrl(parentEmail, childId) {
  return `${PARENTAL_CONTROLS_SERVICE_URL}/parent/${encodeURIComponent(parentEmail)}/children/${childId}/screen-time`;
}

async function setControls(request, parentEmail, childId, overrides) {
  const res = await request.post(screenTimeUrl(parentEmail, childId), {
    data: { ...DISABLED_BASELINE, ...overrides },
  });
  if (!res.ok()) throw new Error(`could not set screen-time controls: ${res.status()}`);
}

test.describe('Student Parental Controls enforcement', () => {
  test.use({ storageState: statePath(STUDENT_ACCOUNT) });

  // This suite's playwright.config.js sets fullyParallel: true, which runs
  // every test in its own worker by default - including tests within the
  // SAME file. That's fine for specs whose tests touch independent state
  // (see e.g. my-kids.spec.js's uniquely-named children), but this file's
  // 3 tests all overwrite the SAME single screen-time config row for
  // student-f - running them concurrently was a real, confirmed race
  // (2026-09-03: two tests intermittently failed because a third test's
  // setControls() landed between this test's own setControls() and its
  // page.goto(), so the overlay it expected was never shown). Force this
  // one file back to serial execution rather than splitting into 3
  // dedicated accounts just for 3 quick config-toggle assertions.
  test.describe.configure({ mode: 'serial' });

  let parentEmail;
  let childId;

  test.beforeAll(async ({ request }) => {
    parentEmail = accountFor(PARENT_ACCOUNT).email;
    const studentEmail = accountFor(STUDENT_ACCOUNT).email;
    childId = await getChildIdByParentEmailFromStudentsService(request, { parentEmail, childEmail: studentEmail });
  });

  test.afterEach(async ({ request }) => {
    await setControls(request, parentEmail, childId, {});
  });

  test('daily limit lock overlay appears once a lockWhenReached limit is hit', async ({ page, request }) => {
    // dailyLimitMinutes: 0 with lockWhenReached forces the locked state
    // deterministically regardless of student-f's real accrued usage that
    // day - usedMinutes (>= 0) always satisfies usedMinutes >= 0.
    await setControls(request, parentEmail, childId, {
      enabled: true, lockWhenReached: true, dailyLimitMinutes: 0,
    });

    await applySession(page.context(), STUDENT_ACCOUNT);
    await page.goto('/');
    await expect(page.getByText('See you tomorrow!', { exact: true }).filter({ visible: true }).first())
      .toBeVisible({ timeout: 20000 });
  });

  test('outside-allowed-hours overlay appears when the current hour is outside the window', async ({ page, request }) => {
    const nowHour = new Date().getHours();
    // A 1-hour window starting at the NEXT hour is guaranteed to exclude the
    // current hour regardless of what time the suite runs.
    const start = (nowHour + 1) % 24;
    const end = (nowHour + 2) % 24;
    await setControls(request, parentEmail, childId, {
      allowedHoursEnabled: true, allowedHoursStart: start, allowedHoursEnd: end,
    });

    await applySession(page.context(), STUDENT_ACCOUNT);
    await page.goto('/');
    await expect(page.getByText('Outside Study Hours', { exact: true }).filter({ visible: true }).first())
      .toBeVisible({ timeout: 20000 });
  });

  test('no lock overlay appears when all restrictions are disabled', async ({ page, request }) => {
    await setControls(request, parentEmail, childId, {});

    await applySession(page.context(), STUDENT_ACCOUNT);
    await page.goto('/');
    await expect(page.getByText('See you tomorrow!', { exact: true })).toHaveCount(0, { timeout: 10000 });
    await expect(page.getByText('Outside Study Hours', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Weekly Limit Reached', { exact: true })).toHaveCount(0);
  });
});

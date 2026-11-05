// Learning Paths — IB PYP curriculum-resolution fix verification. Confirms
// GET /curriculum/subjects (aivorah-learning-paths-service) returns real
// subjects for an IB PYP student, not the empty list a curriculum-name
// normalization gap (Qdrant stores "IB_PYP", the frontend/monolith send
// "IB PYP") silently produced before the fix. Read-only: only ever loads
// the screen, never starts/submits anything, so it's safe alongside
// student-j's own mutating challenges spec.
import { test, expect } from '@playwright/test';
import { applySession, statePath } from '../helpers/auth.js';

export const REQUIRED_ACCOUNTS = ['student-j'];

const ACCOUNT = 'student-j';

test.describe('Learning Paths - IB PYP curriculum resolution', () => {
  test.use({ storageState: statePath(ACCOUNT) });

  test('an IB PYP student sees real subjects, not an empty state', async ({ page }) => {
    await applySession(page.context(), ACCOUNT);
    await page.goto('/learning-paths');
    // Real IB PYP Grade 4 subjects (confirmed against live Qdrant data:
    // Arts, English, ICT, Mathematics, Physical Education, Science, Social
    // Studies) — any one of these appearing confirms the fix; asserting the
    // negative (no "no subjects" empty state) confirms it's not silently
    // falling back to nothing.
    await expect(page.getByText(/no subjects|nothing here yet/i)).not.toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/Mathematics|Science|English/).first()).toBeVisible({ timeout: 10000 });
  });
});

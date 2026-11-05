// Student Read Aloud - navigation, error, empty and first-visit states.
//
// Error/empty/first-visit states are produced by intercepting the Read Aloud reads in the browser
// (setup only); every assertion is on the rendered screen. Uses student-a (shared, read-only):
// nothing here writes to the account.
//
// Needs the refactored Read Aloud (aivorah-frontend feat/read-aloud-refactor) deployed: the legacy
// screen showed a blank list on errors, silently ignored a failed story load on web, and its
// back button had no accessible name.

import { test, expect } from '@playwright/test';
import { newPageAs } from '../../helpers/session.js';
import { EASY_PASSAGE, openReadAloud, passageText } from '../../helpers/readAloud.js';

export const REQUIRED_ACCOUNTS = ['student-a'];
const ACCOUNT = 'student-a';

const PASSAGES = '**/read-aloud/passages?*';
const PASSAGE = '**/read-aloud/passage';
const LEXILE = '**/read-aloud/lexile';

test.describe('Student Read Aloud - states', () => {
  test('Back leaves a story for the list', async ({ browser }) => {
    const page = await newPageAs(browser, ACCOUNT);
    await openReadAloud(page);
    await page.getByText(EASY_PASSAGE.title, { exact: true }).click();
    await expect(passageText(page, EASY_PASSAGE.opening)).toBeVisible({ timeout: 15000 });

    await page.getByRole('button', { name: 'Go back' }).filter({ visible: true }).first().click();
    await expect(page.getByText('Surprise Me!', { exact: true })).toBeVisible();
    await expect(page.getByText(EASY_PASSAGE.title, { exact: true })).toBeVisible();
  });

  test('when stories fail to load, an error with Try again is shown and recovers', async ({ browser }) => {
    const page = await newPageAs(browser, ACCOUNT);
    await page.route(PASSAGES, (route) => route.fulfill({ status: 500, json: { error: 'Service unavailable' } }));
    await openReadAloud(page);

    await expect(page.getByText(/Couldn't load stories/)).toBeVisible({ timeout: 15000 });
    await page.unroute(PASSAGES);
    await page.getByText('Try again', { exact: true }).click();
    await expect(page.getByText(EASY_PASSAGE.title, { exact: true })).toBeVisible({ timeout: 15000 });
  });

  test('a grade with no stories says so', async ({ browser }) => {
    const page = await newPageAs(browser, ACCOUNT);
    await page.route(PASSAGES, (route) => route.fulfill({ json: { passages: [] } }));
    await openReadAloud(page);
    await expect(page.getByText('No stories for your grade yet.', { exact: true })).toBeVisible({ timeout: 15000 });
  });

  test('a story that fails to open explains it and stays on the list', async ({ browser }) => {
    const page = await newPageAs(browser, ACCOUNT);
    await page.route(PASSAGE, (route) => route.fulfill({ status: 500, json: { error: 'boom' } }));
    await openReadAloud(page);

    await page.getByText(EASY_PASSAGE.title, { exact: true }).click();
    await expect(page.getByText('Could not load passage. Please try again.', { exact: true })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Surprise Me!', { exact: true })).toBeVisible();
  });

  test('a student without a reading level is offered the Reading Level Check and can skip it', async ({ browser }) => {
    const page = await newPageAs(browser, ACCOUNT);
    await page.route(LEXILE, (route) => route.fulfill({ json: { lexile: null, needsCalibration: true } }));
    await openReadAloud(page, { skipCheck: false });

    await expect(page.getByText('Reading Level Check', { exact: true })).toBeVisible();
    await expect(page.getByText('Start Reading Test', { exact: true })).toBeVisible();
    await page.getByText('Skip for now', { exact: true }).click();
    await expect(page.getByText('Lexile 400L', { exact: true })).toBeVisible();
    await expect(page.getByText(EASY_PASSAGE.title, { exact: true })).toBeVisible({ timeout: 15000 });
  });
});

// Student Read Aloud - recording a reading and seeing the review.
//
// Runs in the chromium-mic project (real Chrome + a fake microphone playing
// tests/fixtures/audio/Recording-6.wav), like ai-coach-mic.spec.js.
//
// The recording is really transcribed by the server. Only the final scoring call
// (POST /read-aloud/assess) is answered in the browser, computed from the statuses the app sends,
// because the real one saves reading history, moves the reading level and awards XP - and
// student-a is the shared read-only account. Asking for a dedicated account would let this hit
// the real scoring too.

import { test, expect } from '@playwright/test';
import { newPageAs } from '../../helpers/session.js';
import { EASY_PASSAGE, openReadAloud, passageText } from '../../helpers/readAloud.js';

export const REQUIRED_ACCOUNTS = ['student-a'];
const ACCOUNT = 'student-a';

function scoreFrom(body) {
  const statuses = body.wordStatuses || [];
  const count = (s) => statuses.filter((x) => x === s).length;
  const correct = count('correct');
  const accuracy = statuses.length ? Math.round((correct / statuses.length) * 100) : 0;
  return {
    accuracy, wcpm: 0, wpm: 0, totalWords: statuses.length, correct, misread: count('misread'), skipped: count('skipped'),
    duration: Math.round(body.duration || 0), errors: [], feedback: 'E2E-RA scored in the browser.', level: 'developing',
    starsEarned: 0, lexile: null, lexileChange: 0,
  };
}

test.describe('Student Read Aloud - recording', () => {
  test('read a story aloud, stop, listen back, submit and see the review', async ({ browser }) => {
    test.setTimeout(120000);
    const page = await newPageAs(browser, ACCOUNT);
    let scored = null;
    await page.route('**/read-aloud/assess', async (route) => {
      scored = scoreFrom(route.request().postDataJSON());
      await route.fulfill({ json: scored });
    });

    await openReadAloud(page);
    await page.getByText(EASY_PASSAGE.title, { exact: true }).click();
    await expect(passageText(page, EASY_PASSAGE.opening)).toBeVisible({ timeout: 15000 });

    await page.getByText(/^Start Reading/).click();
    await expect(page.getByText('Get ready to read...', { exact: true })).toBeVisible();
    await expect(page.getByText('Done', { exact: true })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/^0:0[2-9]$/)).toBeVisible({ timeout: 15000 });

    await page.getByText('Done', { exact: true }).click();
    await expect(page.getByText('Recording Complete', { exact: true })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Retry', { exact: true })).toBeVisible();

    await page.getByText('Submit', { exact: true }).click();
    await expect(page.getByText('Your Reading', { exact: true })).toBeVisible({ timeout: 60000 });
    await expect(page.getByText('E2E-RA scored in the browser.', { exact: true })).toBeVisible();
    expect(scored).not.toBeNull();
    await expect(page.getByText(`${scored.accuracy}%`, { exact: true })).toBeVisible();
    await expect(page.getByText('Try Again', { exact: true })).toBeVisible();

    await page.getByText('New Passage', { exact: true }).click();
    await expect(page.getByText('Surprise Me!', { exact: true })).toBeVisible();
  });
});

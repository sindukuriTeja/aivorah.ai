// Student Read Aloud - picking a story, previewing it and "Listen First" narration.
//
// Uses student-a (shared, read-only): these tests only read the story list, open a passage and
// play narration. Nothing here records or submits a reading (that writes the student's reading
// level, history and XP - see read-aloud-recording.spec.js, which needs its own account).

import { test, expect } from '@playwright/test';
import { newPageAs } from '../../helpers/session.js';
import { EASY_PASSAGE, HARD_PASSAGE, openReadAloud, passageText } from '../../helpers/readAloud.js';

export const REQUIRED_ACCOUNTS = ['student-a'];
const ACCOUNT = 'student-a';

test.describe('Student Read Aloud - stories', () => {
  test('lists the stories for the student\'s grade and filters them by difficulty', async ({ browser }) => {
    const page = await newPageAs(browser, ACCOUNT);
    await openReadAloud(page);

    await expect(page.getByText('Pick a story, listen or read it aloud, and see how you do!')).toBeVisible();
    await expect(page.getByText(EASY_PASSAGE.title, { exact: true })).toBeVisible();
    await expect(page.getByText(HARD_PASSAGE.title, { exact: true })).toBeVisible();

    await page.getByText('Hard', { exact: true }).first().click();
    await expect(page.getByText(HARD_PASSAGE.title, { exact: true })).toBeVisible();
    await expect(page.getByText(EASY_PASSAGE.title, { exact: true })).toBeHidden();

    await page.getByText('All', { exact: true }).click();
    await expect(page.getByText(EASY_PASSAGE.title, { exact: true })).toBeVisible();
  });

  test('opening a story shows its text and the reading actions', async ({ browser }) => {
    const page = await newPageAs(browser, ACCOUNT);
    await openReadAloud(page);

    await page.getByText(EASY_PASSAGE.title, { exact: true }).click();
    await expect(passageText(page, EASY_PASSAGE.opening)).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Listen First', { exact: true })).toBeVisible();
    await expect(page.getByText(/^Start Reading/)).toBeVisible();
    await expect(page.getByText(/^\d+ words$/)).toBeVisible();
  });

  test('"Surprise Me!" opens a story from the list', async ({ browser }) => {
    const page = await newPageAs(browser, ACCOUNT);
    await openReadAloud(page);

    await page.getByText('Surprise Me!', { exact: true }).click();
    await expect(page.getByText('Listen First', { exact: true })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/^\d+ words$/)).toBeVisible();
  });

  test('"Listen First" plays the story and can be paused and resumed', async ({ browser }) => {
    const page = await newPageAs(browser, ACCOUNT);
    await openReadAloud(page);
    await page.getByText(EASY_PASSAGE.title, { exact: true }).click();
    await expect(passageText(page, EASY_PASSAGE.opening)).toBeVisible({ timeout: 15000 });

    await page.getByText('Listen First', { exact: true }).click();
    await expect(page.getByText('Pause', { exact: true })).toBeVisible({ timeout: 30000 });
    // Let a few words play. Pausing before the first word left the legacy screen stuck on
    // "Resume" (fixed in the refactor), and a child would listen a moment before pausing anyway.
    await page.waitForTimeout(1500);

    await page.getByText('Pause', { exact: true }).click();
    await expect(page.getByText('Resume', { exact: true })).toBeVisible();
    await page.getByText('Resume', { exact: true }).click();
    await expect(page.getByText('Pause', { exact: true })).toBeVisible();
  });
});

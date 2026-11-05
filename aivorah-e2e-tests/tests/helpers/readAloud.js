// Shared steps for the student Read Aloud specs (tests/student/read-aloud/).
import { expect } from '@playwright/test';
import { dismissAnnouncementIfPresent } from './dismissAnnouncement.js';

// Curated Grade 3 passages (aivorah-learning-paths-service services/readAloud/passageData.js).
// Grades without their own set (e.g. CBSE Grade 3 student-a, Grade 6) also get this one.
export const EASY_PASSAGE = { title: 'My Five Senses', opening: 'I use my five senses every day.' };
export const HARD_PASSAGE = { title: 'Protecting Our Forests' };

// Opens /read-aloud and lands on the story list. A student with no reading level yet sees the
// one-time "Reading Level Check" first; skipping it only sets a level for this visit.
export async function openReadAloud(page, { skipCheck = true } = {}) {
  await page.goto('/read-aloud');
  await dismissAnnouncementIfPresent(page);
  const list = page.getByText('Surprise Me!', { exact: true });
  const check = page.getByText('Reading Level Check', { exact: true });
  await expect(list.or(check).first()).toBeVisible({ timeout: 30000 });
  if (skipCheck && (await check.isVisible())) {
    await page.getByText('Skip for now', { exact: true }).click();
    await expect(list).toBeVisible();
  }
}

// The word chips are separate elements, so match the passage card by its first words.
export function passageText(page, opening) {
  return page.getByText(opening, { exact: false }).first();
}

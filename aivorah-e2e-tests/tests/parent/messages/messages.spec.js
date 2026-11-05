import path from 'path';
import { fileURLToPath } from 'url';
import { test, expect } from '@playwright/test';
import { applySession, statePath } from '../../helpers/auth.js';
import { accountFor } from '../../helpers/accounts.js';
import { getStudentIdByEmail, STUDENTS_SERVICE_URL } from '../../helpers/api.js';
import { linkParentToChild, unlinkParentFromChild } from '../../helpers/linkParentChild.js';
import { dismissAnnouncementIfPresent } from '../../helpers/dismissAnnouncement.js';
import {
  openParentMessages, newButton, contactsModal, contactRow, convoRow,
  messageInput, sendButton, attachButton, aivorahBanner, searchInput, filterTab,
} from '../../helpers/teacherMessagesLocators.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AVATAR_FIXTURE = path.join(__dirname, '..', '..', 'fixtures', 'test-avatar.jpg');

const TEACHER = 'teacher-d';
const PARENT = 'parent-b';
const TEACHER_EMAIL = accountFor(TEACHER).email;
const PARENT_EMAIL = accountFor(PARENT).email;

const uniqueText = (base) => `${base} ${Date.now()}`;

async function withLinkedTeacher(request, studentEmail, run) {
  // 2 sequential real network calls to Render free-tier services before any
  // UI step even starts - the default 30s test timeout isn't enough (same
  // reasoning as tests/teacher/challenges/challenges.spec.js's 60s bump).
  test.setTimeout(60000);
  const linkRes = await request.post(
    `${STUDENTS_SERVICE_URL}/teacher/${encodeURIComponent(TEACHER_EMAIL)}/students/link-existing`,
    { data: { studentEmail } }
  );
  if (!linkRes.ok()) {
    const body = await linkRes.json().catch(() => ({}));
    if (!/already|exists/i.test(body?.error || '')) {
      throw new Error(`Could not link ${studentEmail} to ${TEACHER_EMAIL}: ${linkRes.status()} ${JSON.stringify(body)}`);
    }
  }
  const studentId = await getStudentIdByEmail(request, { teacherEmail: TEACHER_EMAIL, studentEmail });
  await linkParentToChild(PARENT_EMAIL, studentId);
  try {
    await run();
  } finally {
    await unlinkParentFromChild(PARENT_EMAIL, studentId).catch(() => {});
  }
}

test.describe('Parent Messages', () => {
  test.use({ storageState: statePath(PARENT) });

  test.beforeEach(async ({ context, page }) => {
    await applySession(context, PARENT);
    await openParentMessages(page);
    await expect(page.getByText('Conversations', { exact: true })).toBeVisible({ timeout: 15000 });
    await dismissAnnouncementIfPresent(page);
  });

  test('linked teacher appears in New DM contacts, and opening + sending a text message works', async ({ page, request }) => {
    await withLinkedTeacher(request, accountFor('student-c').email, async () => {
      await page.reload();
      await dismissAnnouncementIfPresent(page);
      await newButton(page).click();
      await expect(contactRow(page, TEACHER_EMAIL)).toBeVisible({ timeout: 10000 });

      await contactRow(page, TEACHER_EMAIL).click();
      await expect(contactsModal(page)).toBeHidden();

      const text = uniqueText('E2E parent message');
      await messageInput(page).fill(text);
      await sendButton(page).click();
      await expect(page.getByText(text, { exact: true }).first()).toBeVisible({ timeout: 10000 });
    });
  });

  test('attaching a file to a teacher conversation sends it', async ({ page, request }) => {
    await withLinkedTeacher(request, accountFor('student-b').email, async () => {
      await page.reload();
      await dismissAnnouncementIfPresent(page);
      await newButton(page).click();
      await contactRow(page, TEACHER_EMAIL).click();
      await expect(messageInput(page)).toBeVisible({ timeout: 10000 });

      const [chooser] = await Promise.all([page.waitForEvent('filechooser'), attachButton(page).click()]);
      await chooser.setFiles(AVATAR_FIXTURE);
      await sendButton(page).click();

      await expect(page.getByText('test-avatar.jpg', { exact: false }).first()).toBeVisible({ timeout: 10000 });
    });
  });

  test('sending a message to Aivorah produces a visible AI reply', async ({ page }) => {
    await aivorahBanner(page).click();
    await expect(messageInput(page)).toBeVisible({ timeout: 10000 });

    const textLenBefore = await page.evaluate(() => document.body.innerText.length);
    const text = uniqueText('E2E parent question for Aivorah');
    await messageInput(page).fill(text);
    await sendButton(page).click();
    await expect(page.getByText(text, { exact: true }).first()).toBeVisible({ timeout: 10000 });

    // No testID distinguishes Aivorah's reply from the sent message, so
    // assert observable page text actually grew past the sent message itself.
    await expect.poll(
      () => page.evaluate((before) => document.body.innerText.length - before, textLenBefore),
      { timeout: 20000 }
    ).toBeGreaterThan(text.length);
  });

  test('search filters the conversation list by name', async ({ page, request }) => {
    // Aivorah never appears as a sidebar row (only its fixed banner) - a
    // searchable row needs a real linked-teacher conversation instead.
    await withLinkedTeacher(request, accountFor('student-g').email, async () => {
      await page.reload();
      await dismissAnnouncementIfPresent(page);
      await newButton(page).click();
      await contactRow(page, TEACHER_EMAIL).click();
      await messageInput(page).fill(uniqueText('E2E search setup'));
      await sendButton(page).click();
      await expect(convoRow(page, TEACHER_EMAIL)).toBeVisible({ timeout: 10000 });

      await expect(searchInput(page)).toBeVisible({ timeout: 10000 });
      await searchInput(page).fill('zzz-no-such-contact');
      await expect(convoRow(page, TEACHER_EMAIL)).toBeHidden();

      await searchInput(page).fill('Teacher D');
      await expect(convoRow(page, TEACHER_EMAIL)).toBeVisible();
    });
  });

  test('Unread filter hides an already-read conversation, All restores it', async ({ page, request }) => {
    // Every message sent here is outgoing, so this conversation's own
    // unread count is genuinely 0 - a real case for Unread to exclude it.
    await withLinkedTeacher(request, accountFor('student-h').email, async () => {
      await page.reload();
      await dismissAnnouncementIfPresent(page);
      await newButton(page).click();
      await contactRow(page, TEACHER_EMAIL).click();
      await messageInput(page).fill(uniqueText('E2E unread-filter setup'));
      await sendButton(page).click();
      await expect(convoRow(page, TEACHER_EMAIL)).toBeVisible({ timeout: 10000 });

      await expect(filterTab(page, 'unread')).toBeVisible({ timeout: 10000 });
      await filterTab(page, 'unread').click();
      await expect(convoRow(page, TEACHER_EMAIL)).toBeHidden();

      await filterTab(page, 'all').click();
      await expect(convoRow(page, TEACHER_EMAIL)).toBeVisible();
    });
  });
});

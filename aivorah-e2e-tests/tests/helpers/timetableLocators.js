// Locators for the Timetable screen (/timetable) and the Resources screen
// (/resources). The grid cells have no text or testID until a subject is set,
// so cellCenter() finds an empty cell from its day header + period label.

import { expect } from '@playwright/test';

export function openTimetable(page, { grade, section } = {}) {
  if (!grade) return page.goto('/timetable');
  const q = new URLSearchParams({ grade, section: section || '' });
  return page.goto(`/timetable?${q}`);
}

export async function expectTimetableReady(page) {
  await expect(page.getByText('Weekly class schedule', { exact: true })).toBeVisible({ timeout: 20000 });
}

export function periodsButton(page) {
  return page.getByRole('button', { name: /Periods$/ });
}

export function downloadButton(page) {
  return page.getByRole('button', { name: /Download$/ });
}

export function setupDefaultButton(page) {
  return page.getByRole('button', { name: 'Create default periods' });
}

// Clicks the grid cell for a day ('Mon'…'Sat') and a period code ('P1').
export async function clickCell(page, dayLabel, periodCode) {
  const day = page.getByText(dayLabel, { exact: true }).first();
  const period = page.getByText(periodCode, { exact: true }).first();
  await expect(day).toBeVisible();
  await expect(period).toBeVisible();
  const d = await day.boundingBox();
  const p = await period.boundingBox();
  await page.mouse.click(d.x + d.width / 2, p.y + 40);
}

export function slotSubjectInput(page) {
  return page.getByPlaceholder('e.g. Mathematics');
}

export function slotRoomInput(page) {
  return page.getByPlaceholder('e.g. PYP 3 Homeroom');
}

export function slotSaveButton(page) {
  return page.getByRole('button', { name: 'Save', exact: true });
}

export function slotClearButton(page) {
  return page.getByRole('button', { name: /Clear$/ });
}

export function addSubjectButton(page) {
  return page.getByRole('button', { name: /Add a subject|Edit this slot/ });
}

// ── Resources ──

export function openResources(page) {
  return page.goto('/resources');
}

export async function expectResourcesReady(page) {
  await expect(page.getByText('School Policies & Resources', { exact: true })).toBeVisible({ timeout: 20000 });
  await expect(page.getByPlaceholder('Search for a folder or file')).toBeVisible();
}

export function newFolderButton(page) {
  return page.getByRole('button', { name: /New folder$/ });
}

export function uploadButton(page) {
  return page.getByRole('button', { name: /Upload$/ });
}

export function searchInput(page) {
  return page.getByPlaceholder('Search for a folder or file');
}

export function folderNameInput(page) {
  return page.getByPlaceholder('Folder name');
}

export function createFolderButton(page) {
  return page.getByText('Create', { exact: true });
}

// The trash icon sits at the end of an item's row.
export function deleteIconInRow(page, name) {
  return page.getByText(name, { exact: true }).locator('xpath=ancestor::div[2]').locator('div[tabindex="0"]').last();
}

// The web layout renders each menu label twice (sidebar + the off-screen
// mobile drawer); click whichever copy actually receives the click.
export async function clickMenuItem(page, label) {
  const items = page.getByText(label, { exact: true });
  await expect(items.first()).toBeAttached({ timeout: 15000 });
  const n = await items.count();
  for (let i = 0; i < n; i++) {
    try {
      await items.nth(i).click({ trial: true, timeout: 2000 });
      await items.nth(i).click();
      return;
    } catch {
      // covered or hidden copy - try the next one
    }
  }
  throw new Error(`No clickable "${label}" menu item`);
}

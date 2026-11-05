// Locators for Attendance after the move to aivorah-attendance-service:
// teacher screen /teacher/attendance (src/screens/teacher/attendance) and parent
// screen /parent/attendance (src/screens/parent/attendance). testIDs are set in those screens.

// The sidebar is rendered twice (mobile + desktop), so take the visible copy.
export function sidebarAttendanceLink(page) {
  return page.getByText('Attendance', { exact: true }).filter({ visible: true }).first();
}

// ── teacher ──
export function classChip(page, grade, section) {
  return page.getByTestId(`attendance-class-${grade}-${section}`);
}

export function classChips(page) {
  return page.locator('[data-testid^="attendance-class-"]');
}

export function dateInput(page) {
  return page.getByTestId('attendance-date');
}

export function studentRow(page, studentId) {
  return page.getByTestId(`attendance-row-${studentId}`);
}

export function studentRows(page) {
  return page.locator('[data-testid^="attendance-row-"]');
}

export function statusButton(page, studentId, status) {
  return page.getByTestId(`attendance-status-${studentId}-${status}`);
}

export function saveButton(page) {
  return page.getByTestId('attendance-save');
}

export function saveMessage(page) {
  return page.getByTestId('attendance-save-message');
}

export function emptyState(page) {
  return page.getByTestId('attendance-empty');
}

// ── parent ──
export function childChip(page, childId) {
  return page.getByTestId(`attendance-child-${childId}`);
}

export function childChips(page) {
  return page.locator('[data-testid^="attendance-child-"]');
}

export function attendanceRate(page) {
  return page.getByTestId('attendance-rate');
}

export function historyRow(page, date) {
  return page.getByTestId(`attendance-history-row-${date}`);
}

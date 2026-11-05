// Locators for the shared Messages screen (src/screens/shared/messages/*).
// Used by both tests/teacher/messages and tests/parent/messages.

export function openTeacherMessages(page) {
  return page.goto('/teacher/messages');
}

export function openParentMessages(page) {
  return page.goto('/parent/messages');
}

export function searchInput(page) {
  return page.getByTestId('messages-search-input');
}

export function filterTab(page, tab) {
  return page.getByTestId(`messages-filter-${tab}`);
}

export function newButton(page) {
  return page.getByTestId('messages-new-button');
}

export function newDmOption(page) {
  return page.getByTestId('messages-new-dm-option');
}

export function newChannelOption(page) {
  return page.getByTestId('messages-new-channel-option');
}

export function contactsModal(page) {
  return page.getByTestId('messages-contacts-modal');
}

export function contactRow(page, email) {
  return page.getByTestId(`messages-contact-${email}`);
}

export function convoRow(page, email) {
  return page.getByTestId(`messages-convo-${email}`);
}

export function aivorahBanner(page) {
  return page.getByTestId('messages-aivorah-banner');
}

export function messageInput(page) {
  return page.getByTestId('messages-input');
}

export function sendButton(page) {
  return page.getByTestId('messages-send-button');
}

export function attachButton(page) {
  return page.getByTestId('messages-attach-button');
}

// ── New group channel modal ──
export function createChannelModal(page) {
  return page.getByTestId('messages-create-channel-modal');
}

export function channelScopeStaff(page) {
  return page.getByTestId('messages-channel-scope-staff');
}

export function channelNameInput(page) {
  return page.getByTestId('messages-channel-name-input');
}

export function createChannelSubmit(page) {
  return page.getByTestId('messages-create-channel-submit');
}

// ── Channel thread (after opening a channel from the inbox) ──
export function channelInput(page) {
  return page.getByTestId('messages-channel-input');
}

export function channelSendButton(page) {
  return page.getByTestId('messages-channel-send-button');
}

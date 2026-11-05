const mockGroqCreate = jest.fn();
jest.mock('groq-sdk', () => jest.fn().mockImplementation(() => ({
  chat: { completions: { create: (...args) => mockGroqCreate(...args) } },
})));

const mockSendMail = jest.fn();
const mockCreateTransport = jest.fn(() => ({ sendMail: mockSendMail }));
jest.mock('nodemailer', () => ({ createTransport: (...args) => mockCreateTransport(...args) }));

const { getChatReply, sendSupportTicket } = require('../../services/help');

function groqResponse(content) {
  return { choices: [{ message: { content } }] };
}

const ORIGINAL_ENV = process.env;

beforeEach(() => {
  jest.clearAllMocks();
  process.env = { ...ORIGINAL_ENV, EMAIL_USER: 'support@aivorah.test', EMAIL_PASS: 'app-password' };
});

afterEach(() => {
  process.env = ORIGINAL_ENV;
});

describe('getChatReply', () => {
  test('returns the real reply text from Groq', async () => {
    mockGroqCreate.mockResolvedValue(groqResponse('You can find your XP in Progress!'));

    const result = await getChatReply('Where do I see my XP?');

    expect(result).toEqual({ reply: 'You can find your XP in Progress!' });
    expect(mockGroqCreate).toHaveBeenCalledWith(expect.objectContaining({
      messages: expect.arrayContaining([expect.objectContaining({ role: 'user', content: 'Where do I see my XP?' })]),
    }));
  });

  test('a Groq failure returns a real friendly error, not a thrown exception', async () => {
    mockGroqCreate.mockRejectedValue(new Error('rate limited'));

    const result = await getChatReply('Where do I see my XP?');

    expect(result).toEqual({ error: 'Support chat unavailable. Please try again.' });
  });
});

describe('sendSupportTicket', () => {
  test('sends a real email to the support team with the real ticket details', async () => {
    mockSendMail.mockResolvedValue({});

    const result = await sendSupportTicket({ senderEmail: 'student@a.com', subject: 'Cannot log in', message: 'App crashes on login.' });

    expect(result).toEqual({ success: true, message: 'Support ticket submitted successfully.' });
    expect(mockSendMail).toHaveBeenCalledWith(expect.objectContaining({
      to: 'aivorah24@gmail.com',
      replyTo: 'student@a.com',
      subject: '[Aivorah Support Ticket] Cannot log in',
    }));
    expect(mockSendMail.mock.calls[0][0].text).toContain('App crashes on login.');
  });

  test('an empty senderEmail omits replyTo instead of sending an empty string', async () => {
    mockSendMail.mockResolvedValue({});

    await sendSupportTicket({ senderEmail: '', subject: 'Question', message: 'How do streaks work?' });

    expect(mockSendMail.mock.calls[0][0].replyTo).toBeUndefined();
  });

  test('missing EMAIL_USER/EMAIL_PASS returns a real config error without attempting to send', async () => {
    process.env.EMAIL_USER = '';
    process.env.EMAIL_PASS = '';

    const result = await sendSupportTicket({ senderEmail: 'a@a.com', subject: 'S', message: 'M' });

    expect(result).toEqual({ success: false, error: 'Email service not configured. Set RESEND_API_KEY (or EMAIL_USER/EMAIL_PASS).' });
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  test('an email send failure returns a real friendly error, not a thrown exception', async () => {
    mockSendMail.mockRejectedValue(new Error('SMTP down'));

    const result = await sendSupportTicket({ senderEmail: 'a@a.com', subject: 'S', message: 'M' });

    expect(result).toEqual({ success: false, error: 'Failed to submit support ticket. Please try again.' });
  });
});

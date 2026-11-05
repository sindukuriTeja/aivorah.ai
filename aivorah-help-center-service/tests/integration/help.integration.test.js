const request = require('supertest');

jest.mock('../../services/help', () => ({
  getChatReply: jest.fn(),
  sendSupportTicket: jest.fn(),
}));

const { getChatReply, sendSupportTicket } = require('../../services/help');
const app = require('../../index');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('GET /health', () => {
  test('reports ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', service: 'aivorah-help-center-service' });
  });
});

describe('POST /help/chat', () => {
  test('requires a non-empty message', async () => {
    const res = await request(app).post('/help/chat').send({ message: '' });
    expect(res.status).toBe(400);
  });

  test('requires message, whitespace-only does not count', async () => {
    const res = await request(app).post('/help/chat').send({ message: '   ' });
    expect(res.status).toBe(400);
  });

  test('returns the real reply from the service, trimming the message first', async () => {
    getChatReply.mockResolvedValue({ reply: 'You can see your XP in Progress!' });

    const res = await request(app).post('/help/chat').send({ message: '  Where is my XP?  ' });

    expect(res.status).toBe(200);
    expect(getChatReply).toHaveBeenCalledWith('Where is my XP?');
    expect(res.body).toEqual({ reply: 'You can see your XP in Progress!' });
  });

  test('a real service-level error maps to 500', async () => {
    getChatReply.mockResolvedValue({ error: 'Support chat unavailable. Please try again.' });

    const res = await request(app).post('/help/chat').send({ message: 'hi' });

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Support chat unavailable. Please try again.' });
  });
});

describe('POST /help/ticket', () => {
  test('requires a subject', async () => {
    const res = await request(app).post('/help/ticket').send({ message: 'Something broke' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, error: 'subject is required' });
  });

  test('requires a message', async () => {
    const res = await request(app).post('/help/ticket').send({ subject: 'Bug report' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, error: 'message is required' });
  });

  test('trims whitespace-only subject/message down to empty and still 400s', async () => {
    const res = await request(app).post('/help/ticket').send({ subject: '   ', message: '   ' });
    expect(res.status).toBe(400);
  });

  test('submits a real ticket with real trimmed fields', async () => {
    sendSupportTicket.mockResolvedValue({ success: true, message: 'Support ticket submitted successfully.' });

    const res = await request(app).post('/help/ticket').send({ email: '  a@a.com  ', subject: '  Cannot log in  ', message: '  App crashes.  ' });

    expect(res.status).toBe(200);
    expect(sendSupportTicket).toHaveBeenCalledWith({ senderEmail: 'a@a.com', subject: 'Cannot log in', message: 'App crashes.' });
    expect(res.body).toEqual({ success: true, message: 'Support ticket submitted successfully.' });
  });

  test('a missing email is passed through as an empty string, not undefined', async () => {
    sendSupportTicket.mockResolvedValue({ success: true, message: 'Support ticket submitted successfully.' });

    await request(app).post('/help/ticket').send({ subject: 'S', message: 'M' });

    expect(sendSupportTicket).toHaveBeenCalledWith({ senderEmail: '', subject: 'S', message: 'M' });
  });

  test('a real service-level failure maps to 500', async () => {
    sendSupportTicket.mockResolvedValue({ success: false, error: 'Failed to submit support ticket. Please try again.' });

    const res = await request(app).post('/help/ticket').send({ subject: 'S', message: 'M' });

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ success: false, error: 'Failed to submit support ticket. Please try again.' });
  });
});

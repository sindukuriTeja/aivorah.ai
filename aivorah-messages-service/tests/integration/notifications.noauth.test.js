const { makeSupabaseMock } = require('../helpers/supabaseMock');
const mockSb = makeSupabaseMock();
jest.mock('../../services/supabase', () => mockSb.supabase);
jest.mock('../../services/firebaseAdmin', () => null);
jest.mock('../../services/push', () => ({ sendPush: jest.fn() }));
jest.mock('cloudinary', () => ({ v2: { config: jest.fn(), uploader: { upload: jest.fn() } } }));
jest.mock('groq-sdk', () => jest.fn().mockImplementation(() => ({ chat: { completions: { create: jest.fn() } } })));

const request = require('supertest');
const app = require('../../index');

test('503 (not a silent pass) when the Firebase service account is missing', async () => {
  const res = await request(app).get('/notifications').set('Authorization', 'Bearer anything');
  expect(res.status).toBe(503);
  expect(mockSb.supabase.from).not.toHaveBeenCalled();
});

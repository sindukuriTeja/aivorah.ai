// Integration tests — hit the REAL routes (routes/stories.js) through
// Supertest. services/stories.js is mocked at the module boundary (the
// route layer is thin — its own logic, like status-code mapping, is what's
// under test here; the service's own logic is covered by the unit tests).

jest.mock('../../services/stories', () => ({
  listStories: jest.fn(),
  getStory: jest.fn(),
  getPage: jest.fn(),
  getPageAudio: jest.fn(),
  prewarmAll: jest.fn(),
  countTotalPages: jest.fn(),
}));

const request = require('supertest');
const stories = require('../../services/stories');
const app = require('../../index');

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.ELEVENLABS_API_KEY;
});

describe('GET /stories', () => {
  test('returns the story list', async () => {
    stories.listStories.mockReturnValueOnce([{ id: 'ambarisha', title: 'Ambarisha Maharaja' }]);
    const res = await request(app).get('/stories');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: 'ambarisha', title: 'Ambarisha Maharaja' }]);
  });
});

describe('GET /stories/:id', () => {
  test('known story -> 200', async () => {
    stories.getStory.mockReturnValueOnce({ id: 'ambarisha', pages: [] });
    const res = await request(app).get('/stories/ambarisha');
    expect(res.status).toBe(200);
  });

  test('unknown story -> 404', async () => {
    stories.getStory.mockReturnValueOnce(null);
    const res = await request(app).get('/stories/nope');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Story not found');
  });
});

describe('GET /stories/:id/page/:pageNumber', () => {
  test('known page -> 200, includes totalPages and storyTitle', async () => {
    stories.getPage.mockReturnValueOnce({
      page: { pageNumber: 2, text: 'Page two.' },
      story: { title: 'Ambarisha Maharaja', pages: [{}, {}] },
    });
    const res = await request(app).get('/stories/ambarisha/page/2');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ pageNumber: 2, text: 'Page two.', totalPages: 2, storyTitle: 'Ambarisha Maharaja' });
  });

  test('unknown story -> 404', async () => {
    stories.getPage.mockReturnValueOnce({ error: 'not_found_story' });
    const res = await request(app).get('/stories/nope/page/1');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Story not found');
  });

  test('unknown page -> 404', async () => {
    stories.getPage.mockReturnValueOnce({ error: 'not_found_page' });
    const res = await request(app).get('/stories/ambarisha/page/99');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Page not found');
  });
});

describe('GET /stories/:id/audio/:pageNumber', () => {
  test('cached audio -> 200 with the cache result', async () => {
    stories.getPageAudio.mockResolvedValueOnce({ audioUrl: '/data/audio/stories/abc.mp3', cached: true, narrator: 'grandmother' });
    const res = await request(app).get('/stories/ambarisha/audio/1');
    expect(res.status).toBe(200);
    expect(res.body.cached).toBe(true);
    expect(stories.getPageAudio).toHaveBeenCalledWith('ambarisha', 1, 'grandmother');
  });

  test('defaults to grandmother narrator when none given', async () => {
    stories.getPageAudio.mockResolvedValueOnce({ audioUrl: '/x.mp3' });
    await request(app).get('/stories/ambarisha/audio/1');
    expect(stories.getPageAudio).toHaveBeenCalledWith('ambarisha', 1, 'grandmother');
  });

  test('a requested narrator is passed through (lowercased)', async () => {
    stories.getPageAudio.mockResolvedValueOnce({ audioUrl: '/x.mp3' });
    await request(app).get('/stories/ambarisha/audio/1').query({ narrator: 'Grandfather' });
    expect(stories.getPageAudio).toHaveBeenCalledWith('ambarisha', 1, 'grandfather');
  });

  test('no API key configured -> 503', async () => {
    stories.getPageAudio.mockResolvedValueOnce({ error: 'no_api_key' });
    const res = await request(app).get('/stories/ambarisha/audio/1');
    expect(res.status).toBe(503);
  });

  test('unknown story -> 404', async () => {
    stories.getPageAudio.mockResolvedValueOnce({ error: 'not_found_story' });
    const res = await request(app).get('/stories/nope/audio/1');
    expect(res.status).toBe(404);
  });

  test('unknown page -> 404', async () => {
    stories.getPageAudio.mockResolvedValueOnce({ error: 'not_found_page' });
    const res = await request(app).get('/stories/ambarisha/audio/99');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Page not found');
  });

  test('a thrown error during generation -> 500', async () => {
    stories.getPageAudio.mockRejectedValueOnce(new Error('TTS provider down'));
    const res = await request(app).get('/stories/ambarisha/audio/1');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Voice generation failed');
  });
});

describe('POST /stories/prewarm', () => {
  test('no ElevenLabs key configured -> 503, prewarm never starts', async () => {
    const res = await request(app).post('/stories/prewarm');
    expect(res.status).toBe(503);
    expect(stories.prewarmAll).not.toHaveBeenCalled();
  });

  test('with a key configured -> 202-style immediate response, prewarm starts in background', async () => {
    process.env.ELEVENLABS_API_KEY = 'fake-key';
    stories.countTotalPages.mockReturnValueOnce(10);
    const res = await request(app).post('/stories/prewarm');
    expect(res.status).toBe(200);
    expect(res.body.totalPages).toBe(20); // countTotalPages() * 2 (both narrators)
    expect(stories.prewarmAll).toHaveBeenCalled();
  });
});

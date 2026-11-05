// Unit tests for the TTS-generation paths in services/stories.js —
// getPageAudio() and prewarmAll(), which internally exercise
// generateViaTikTok, generateViaElevenLabs, generateAndCacheAudio, and
// generateTimingsViaWhisper. fs and global.fetch are mocked; no real
// network call or disk write happens.

jest.mock('fs');
const fs = require('fs');

const MOCK_STORIES = [
  {
    id: 'ambarisha',
    title: 'Ambarisha Maharaja',
    pages: [
      { pageNumber: 1, text: 'Once there was a devoted king.' },
    ],
  },
];

function mockFetchByUrl(handlers) {
  global.fetch = jest.fn((url) => {
    const u = String(url);
    if (u.includes('elevenlabs.io') && handlers.elevenlabs) return handlers.elevenlabs();
    if (u.includes('groq.com') && handlers.whisper) return handlers.whisper();
    if (u.includes('tiktok-tts') && handlers.tiktok) return handlers.tiktok();
    return Promise.reject(new Error(`unexpected fetch to ${u}`));
  });
}

const stories = require('../../services/stories');

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.ELEVENLABS_API_KEY;
  delete process.env.GROQ_API_KEY;
  delete global.fetch;
  fs.readFileSync = jest.fn().mockReturnValue(JSON.stringify(MOCK_STORIES));
  fs.existsSync = jest.fn().mockReturnValue(false);
  fs.writeFileSync = jest.fn();
});

describe('getPageAudio', () => {
  test('unknown story -> not_found_story error, no fetch attempted', async () => {
    const result = await stories.getPageAudio('nope', 1, 'grandmother');
    expect(result).toEqual({ error: 'not_found_story' });
  });

  test('unknown page -> not_found_page error', async () => {
    const result = await stories.getPageAudio('ambarisha', 99, 'grandmother');
    expect(result).toEqual({ error: 'not_found_page' });
  });

  test('cached mp3 + cached timings file -> serves instantly, no fetch at all', async () => {
    fs.existsSync = jest.fn().mockReturnValue(true); // both mp3 and timings "exist"
    fs.readFileSync = jest.fn((p) => {
      if (String(p).includes('timings')) return JSON.stringify([{ word: 'Once', startTime: 0, endTime: 0.3 }]);
      return JSON.stringify(MOCK_STORIES);
    });

    const result = await stories.getPageAudio('ambarisha', 1, 'grandmother');

    expect(result.cached).toBe(true);
    expect(result.timingProvider).toBe('elevenlabs');
    expect(global.fetch).not.toBeDefined();
  });

  test('cached mp3 but no timings file, GROQ key missing -> whisper skipped, wordTimings null', async () => {
    fs.existsSync = jest.fn((p) => !String(p).includes('.timings.'));
    const result = await stories.getPageAudio('ambarisha', 1, 'grandmother');

    expect(result.cached).toBe(true);
    expect(result.timingProvider).toBe('whisper');
    expect(result.wordTimings).toBeNull();
  });

  test('cached mp3 but no timings file, GROQ key set -> calls Whisper and caches the result', async () => {
    process.env.GROQ_API_KEY = 'fake-groq-key';
    fs.existsSync = jest.fn((p) => !String(p).includes('.timings.'));
    mockFetchByUrl({
      whisper: () => Promise.resolve({
        ok: true,
        json: async () => ({ words: [{ word: 'Once', start: 0, end: 0.3 }] }),
      }),
    });

    const result = await stories.getPageAudio('ambarisha', 1, 'grandmother');

    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('groq.com'), expect.any(Object));
    expect(fs.writeFileSync).toHaveBeenCalledWith(expect.stringContaining('.timings.json'), expect.any(String));
    expect(result.cached).toBe(true);
  });

  test('cached mp3, Whisper request fails (non-ok) -> falls back to null timings, no crash', async () => {
    process.env.GROQ_API_KEY = 'fake-groq-key';
    fs.existsSync = jest.fn((p) => !String(p).includes('.timings.'));
    mockFetchByUrl({
      whisper: () => Promise.resolve({ ok: false, status: 500, text: async () => 'server error' }),
    });

    const result = await stories.getPageAudio('ambarisha', 1, 'grandmother');

    expect(result.wordTimings).toBeNull();
    expect(result.cached).toBe(true);
  });

  test('not cached, no ElevenLabs key -> no_api_key error, no fetch attempted', async () => {
    fs.existsSync = jest.fn().mockReturnValue(false);
    const result = await stories.getPageAudio('ambarisha', 1, 'grandmother');
    expect(result).toEqual({ error: 'no_api_key' });
  });

  test('not cached, ElevenLabs succeeds -> caches audio + timings, provider elevenlabs', async () => {
    process.env.ELEVENLABS_API_KEY = 'fake-el-key';
    fs.existsSync = jest.fn().mockReturnValue(false);
    mockFetchByUrl({
      elevenlabs: () => Promise.resolve({
        ok: true,
        json: async () => ({
          audio_base64: Buffer.from('fake-audio').toString('base64'),
          alignment: {
            characters: ['O', 'n', 'c', 'e'],
            character_start_times_seconds: [0, 0.1, 0.2, 0.3],
            character_end_times_seconds: [0.1, 0.2, 0.3, 0.4],
          },
        }),
      }),
    });

    const result = await stories.getPageAudio('ambarisha', 1, 'grandmother');

    expect(result.cached).toBe(false);
    expect(result.provider).toBe('elevenlabs');
    expect(result.wordTimings).not.toBeNull();
    expect(fs.writeFileSync).toHaveBeenCalledWith(expect.stringContaining('.mp3'), expect.any(Buffer));
    expect(fs.writeFileSync).toHaveBeenCalledWith(expect.stringContaining('.timings.json'), expect.any(String));
  });

  test('not cached, ElevenLabs fails -> falls back to TikTok, no timings written', async () => {
    process.env.ELEVENLABS_API_KEY = 'fake-el-key';
    fs.existsSync = jest.fn().mockReturnValue(false);
    mockFetchByUrl({
      elevenlabs: () => Promise.resolve({ ok: false, status: 500, text: async () => 'EL down' }),
      tiktok: () => Promise.resolve({
        ok: true,
        json: async () => ({ success: true, data: Buffer.from('tiktok-audio').toString('base64') }),
      }),
    });

    const result = await stories.getPageAudio('ambarisha', 1, 'grandmother');

    expect(result.provider).toBe('tiktok');
    expect(result.wordTimings).toBeNull();
    expect(fs.writeFileSync).toHaveBeenCalledTimes(1); // only the mp3, no timings file
  });

  test('TikTok itself fails -> the whole call rejects (caller/route maps this to 500)', async () => {
    process.env.ELEVENLABS_API_KEY = 'fake-el-key'; // EL must be attempted first before TikTok fallback kicks in
    fs.existsSync = jest.fn().mockReturnValue(false);
    mockFetchByUrl({
      elevenlabs: () => Promise.resolve({ ok: false, status: 500, text: async () => 'EL down' }),
      tiktok: () => Promise.resolve({ ok: true, json: async () => ({ success: false }) }),
    });

    await expect(stories.getPageAudio('ambarisha', 1, 'grandmother')).rejects.toThrow('TikTok TTS failed');
  });
});

describe('prewarmAll', () => {
  test('every page already cached -> all skipped, nothing generated, no fetch', async () => {
    fs.existsSync = jest.fn().mockReturnValue(true);
    const result = await stories.prewarmAll();
    expect(result).toEqual({ generated: 0, skipped: 2, failed: 0, errors: [] }); // 1 page x 2 narrators
    expect(global.fetch).not.toBeDefined();
  });

  test('an uncached page is generated and cached for both narrators', async () => {
    fs.existsSync = jest.fn().mockReturnValue(false);
    process.env.ELEVENLABS_API_KEY = 'fake-el-key';
    mockFetchByUrl({
      elevenlabs: () => Promise.resolve({
        ok: true,
        json: async () => ({ audio_base64: Buffer.from('a').toString('base64'), alignment: null }),
      }),
    });

    const result = await stories.prewarmAll();

    expect(result.generated).toBe(2); // grandmother + grandfather
    expect(result.failed).toBe(0);
  }, 10000);

  test('a generation failure for one page is recorded, not fatal to the whole run', async () => {
    fs.existsSync = jest.fn().mockReturnValue(false);
    mockFetchByUrl({
      tiktok: () => Promise.reject(new Error('network down')),
    });

    const result = await stories.prewarmAll();

    expect(result.failed).toBe(2);
    expect(result.generated).toBe(0);
    expect(result.errors[0]).toContain('network down');
  }, 10000);
});

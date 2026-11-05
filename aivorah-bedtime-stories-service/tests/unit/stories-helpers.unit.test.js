// Unit tests for the pure helper functions in services/stories.js —
// splitText, storyCacheKey, alignmentToWordTimings. No fs/network involved.

const { splitText, storyCacheKey, alignmentToWordTimings } = require('../../services/stories');

describe('splitText', () => {
  test('text under the limit is returned as a single chunk', () => {
    expect(splitText('Short text.')).toEqual(['Short text.']);
  });

  test('long text is split at sentence boundaries, each chunk under the limit', () => {
    const sentence = 'This is a reasonably long sentence about a story. ';
    const text = sentence.repeat(10).trim();
    const chunks = splitText(text, 190);
    chunks.forEach(c => expect(c.length).toBeLessThanOrEqual(190));
    // Rejoining should reconstruct the same sentences (no words dropped).
    expect(chunks.join(' ')).toContain('reasonably long sentence');
  });

  test('a single sentence longer than maxLen is hard-truncated (never crashes)', () => {
    const longWord = 'x'.repeat(300);
    const chunks = splitText(longWord, 190);
    expect(chunks[0].length).toBeLessThanOrEqual(190);
  });

  test('empty text -> a single empty-string chunk (short-circuits under the length check)', () => {
    expect(splitText('')).toEqual(['']);
  });
});

describe('storyCacheKey', () => {
  test('is deterministic — same inputs always produce the same key', () => {
    const a = storyCacheKey('story-1', 3, 'grandmother');
    const b = storyCacheKey('story-1', 3, 'grandmother');
    expect(a).toBe(b);
  });

  test('different narrators produce different keys (no cache collision between voices)', () => {
    const grandma = storyCacheKey('story-1', 3, 'grandmother');
    const grandpa = storyCacheKey('story-1', 3, 'grandfather');
    expect(grandma).not.toBe(grandpa);
  });

  test('different page numbers produce different keys', () => {
    const page1 = storyCacheKey('story-1', 1, 'grandmother');
    const page2 = storyCacheKey('story-1', 2, 'grandmother');
    expect(page1).not.toBe(page2);
  });

  test('different story IDs produce different keys', () => {
    const s1 = storyCacheKey('story-1', 1, 'grandmother');
    const s2 = storyCacheKey('story-2', 1, 'grandmother');
    expect(s1).not.toBe(s2);
  });
});

describe('alignmentToWordTimings', () => {
  test('no alignment data -> null (no crash)', () => {
    expect(alignmentToWordTimings('Hello world', null)).toBeNull();
    expect(alignmentToWordTimings('Hello world', {})).toBeNull();
  });

  test('maps each word to its real start/end time from the character alignment', () => {
    // "Hi bye" — chars: H i _ b y e
    const alignment = {
      characters: ['H', 'i', ' ', 'b', 'y', 'e'],
      character_start_times_seconds: [0.0, 0.1, 0.2, 0.3, 0.4, 0.5],
      character_end_times_seconds:   [0.1, 0.2, 0.3, 0.4, 0.5, 0.6],
    };
    const result = alignmentToWordTimings('Hi bye', alignment);

    expect(result).toEqual([
      { word: 'Hi', startTime: 0.0, endTime: 0.2 },
      { word: 'bye', startTime: 0.3, endTime: 0.6 },
    ]);
  });

  test('produces one timing entry per word, in order', () => {
    const text = 'One two three';
    const alignment = {
      characters: 'One two three'.split(''),
      character_start_times_seconds: Array.from({ length: 13 }, (_, i) => i * 0.1),
      character_end_times_seconds:   Array.from({ length: 13 }, (_, i) => i * 0.1 + 0.1),
    };
    const result = alignmentToWordTimings(text, alignment);
    expect(result.map(t => t.word)).toEqual(['One', 'two', 'three']);
  });
});

// Unit tests for listStories/getStory/getPage — the read-only data access
// functions in services/stories.js. fs is mocked so no real data file is read.

jest.mock('fs');
const fs = require('fs');
const stories = require('../../services/stories');

const MOCK_STORIES = [
  {
    id: 'ambarisha',
    title: 'Ambarisha Maharaja',
    subtitle: 'The Devotee Who Defeated a Sage',
    coverColor: '#7c3aed',
    coverGradient: ['#7c3aed', '#4f46e5'],
    coverIcon: 'crown',
    ageGroup: '8-12',
    collection: 'Srimad Bhagavatam',
    pages: [
      { pageNumber: 1, text: 'Page one text.' },
      { pageNumber: 2, text: 'Page two text.' },
    ],
  },
];

beforeEach(() => {
  jest.clearAllMocks();
  fs.readFileSync = jest.fn().mockReturnValue(JSON.stringify(MOCK_STORIES));
  fs.existsSync = jest.fn().mockReturnValue(false);
});

describe('listStories', () => {
  test('returns a summary (no full page text) for every story', () => {
    const result = stories.listStories();
    expect(result).toEqual([
      {
        id: 'ambarisha', title: 'Ambarisha Maharaja', subtitle: 'The Devotee Who Defeated a Sage',
        coverColor: '#7c3aed', coverGradient: ['#7c3aed', '#4f46e5'], coverIcon: 'crown',
        coverImageUrl: null, ageGroup: '8-12', collection: 'Srimad Bhagavatam', pageCount: 2,
      },
    ]);
  });

  test('a data file read failure -> empty list, not a crash', () => {
    fs.readFileSync = jest.fn().mockImplementation(() => { throw new Error('ENOENT'); });
    expect(stories.listStories()).toEqual([]);
  });
});

describe('getStory', () => {
  test('a known id returns the full story (including pages)', () => {
    const result = stories.getStory('ambarisha');
    expect(result?.pages).toHaveLength(2);
  });

  test('an unknown id returns null', () => {
    expect(stories.getStory('does-not-exist')).toBeNull();
  });
});

describe('countTotalPages', () => {
  test('sums page counts across every story in the real data file', () => {
    expect(stories.countTotalPages()).toBe(2); // the one mock story has 2 pages
  });

  test('a data file read failure -> 0, not a crash', () => {
    fs.readFileSync = jest.fn().mockImplementation(() => { throw new Error('ENOENT'); });
    expect(stories.countTotalPages()).toBe(0);
  });

  test('multiple stories -> sums all of their page counts', () => {
    fs.readFileSync = jest.fn().mockReturnValue(JSON.stringify([
      { ...MOCK_STORIES[0] },
      { id: 'dhruva', pages: [{ pageNumber: 1, text: 'x' }, { pageNumber: 2, text: 'y' }, { pageNumber: 3, text: 'z' }] },
    ]));
    expect(stories.countTotalPages()).toBe(5); // 2 + 3
  });
});

describe('getPage', () => {
  test('unknown story -> not_found_story error', () => {
    expect(stories.getPage('nope', 1)).toEqual({ error: 'not_found_story' });
  });

  test('known story, unknown page number -> not_found_page error', () => {
    expect(stories.getPage('ambarisha', 99)).toEqual({ error: 'not_found_page' });
  });

  test('known story and page -> returns the page and its parent story', () => {
    const result = stories.getPage('ambarisha', 2);
    expect(result.page.text).toBe('Page two text.');
    expect(result.story.id).toBe('ambarisha');
  });
});

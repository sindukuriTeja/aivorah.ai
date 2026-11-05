const express = require('express');
const router  = express.Router();
const {
  listStories,
  getStory,
  getPage,
  getPageAudio,
  prewarmAll,
  countTotalPages,
} = require('../services/stories');

// ── GET /stories — list all stories ─────────────────────────────────────────
router.get('/', (req, res) => {
  res.json(listStories());
});

// ── GET /stories/:id — full story ────────────────────────────────────────────
router.get('/:id', (req, res) => {
  const story = getStory(req.params.id);
  if (!story) return res.status(404).json({ error: 'Story not found' });
  res.json(story);
});

// ── GET /stories/:id/page/:pageNumber — single page ──────────────────────────
router.get('/:id/page/:pageNumber', (req, res) => {
  const pageNum = parseInt(req.params.pageNumber, 10);
  const result  = getPage(req.params.id, pageNum);
  if (result.error === 'not_found_story') return res.status(404).json({ error: 'Story not found' });
  if (result.error === 'not_found_page') return res.status(404).json({ error: 'Page not found' });
  res.json({ ...result.page, totalPages: result.story.pages.length, storyTitle: result.story.title });
});

// ── GET /stories/:id/audio/:pageNumber?narrator=grandmother ──────────────────
// Returns cached audio instantly if pre-generated; generates+caches on first call.
router.get('/:id/audio/:pageNumber', async (req, res) => {
  const narrator = (req.query.narrator || 'grandmother').toLowerCase();
  const pageNum  = parseInt(req.params.pageNumber, 10);

  try {
    const result = await getPageAudio(req.params.id, pageNum, narrator);
    if (result.error === 'not_found_story') return res.status(404).json({ error: 'Story not found' });
    if (result.error === 'not_found_page') return res.status(404).json({ error: 'Page not found' });
    if (result.error === 'no_api_key') return res.status(503).json({ error: 'ElevenLabs API key not configured' });
    res.json(result);
  } catch (err) {
    console.error('Story TTS error:', err.message);
    res.status(500).json({ error: 'Voice generation failed', detail: err.message });
  }
});

// ── POST /stories/prewarm — pre-generate all pages for both voices ────────────
// Call once after deployment. Safe to call multiple times (skips cached pages).
router.post('/prewarm', async (req, res) => {
  if (!process.env.ELEVENLABS_API_KEY) {
    return res.status(503).json({ error: 'ElevenLabs API key not configured' });
  }
  // Send immediate response; prewarm runs in background
  res.json({ message: 'Prewarm started in background', totalPages: countTotalPages() * 2 });
  prewarmAll();
});

module.exports = router;

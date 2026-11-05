require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json({ limit: '20mb' }));

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'aivorah-bedtime-stories-service' }));

// Cached TTS audio (.mp3 + .timings.json) — generated on first play, served statically after.
app.use('/data/audio/stories', express.static(path.join(__dirname, 'data/audio/stories')));
// Page-flip sound effect.
app.use('/sounds', express.static(path.join(__dirname, 'public/sounds')));

app.use('/stories', require('./routes/stories'));

const PORT = process.env.PORT || 3011;
// Only start listening when run directly (`node index.js`) — not when
// required by tests, so Supertest can exercise `app` in-memory.
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Aivorah Bedtime Stories service running on http://localhost:${PORT}`);
  });
}

module.exports = app;

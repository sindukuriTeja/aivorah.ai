# Aivorah Bedtime Stories Service

Standalone microservice for Bedtime Stories — story list, reader pages,
TTS narration (ElevenLabs with word-level timing, TikTok fallback), and
Whisper-based timing recovery for already-cached audio — extracted from
`ai-mentor/server`.

## Structure

```
routes/
  stories.js   — thin route handlers: GET /, GET /:id, GET /:id/page/:pageNumber,
                 GET /:id/audio/:pageNumber, POST /prewarm
services/
  stories.js   — story data access, TTS generation (ElevenLabs → TikTok fallback),
                 Whisper word-timing recovery, audio caching, prewarm
data/
  bhagavata_stories.json — story content (text, scene metadata, Cloudinary cover/page image URLs)
  audio/stories/         — generated TTS cache (.mp3 + .timings.json per page+narrator).
                            NOT committed (see .gitignore) — regenerates on first play.
                            Only .gitkeep is tracked so the directory exists.
public/sounds/
  page-flip.mp3 — page-turn sound effect
```

## Setup

```bash
npm install
cp .env.example .env   # fill in real keys
npm run dev             # nodemon, or `npm start` for a plain run
```

Runs on `PORT` (default `3011`).

## Endpoints

- `GET /stories` — list all stories (grouped by collection on the frontend)
- `GET /stories/:id` — full story with all pages
- `GET /stories/:id/page/:pageNumber` — single page
- `GET /stories/:id/audio/:pageNumber?narrator=grandmother|grandfather` — cached or freshly-generated narration audio + word timings
- `POST /stories/prewarm` — pre-generate every page for both voices (run once after deployment; safe to re-run, skips cached pages)
- `GET /health`
- `GET /data/audio/stories/*` — static cached audio files
- `GET /sounds/page-flip.mp3` — static page-turn sound

## Branching

`main` is protected by convention — no direct pushes. Work on a feature
branch and open a PR.

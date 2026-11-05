# Aivorah Help Center Service

Standalone microservice for Help Center — the "Chat with Aivorah 24/7" AI
support assistant and the "Submit a Ticket" support-email flow — extracted
from `ai-mentor/server`.

## Structure

```
routes/
  help.js       — thin route handlers: POST /chat, POST /ticket
services/
  help.js       — domain logic: Groq chat completion (support-only system
                   prompt), nodemailer support-ticket email
```

## Setup

```bash
npm install
cp .env.example .env   # fill in real keys
npm run dev             # nodemon, or `npm start` for a plain run
```

Runs on `PORT` (default `3013`).

## Endpoints

- `POST /help/chat` — `{ message }` → `{ reply }` or `{ error }`. Support-only
  scope — redirects academic questions to AI Coach.
- `POST /help/ticket` — `{ email?, subject, message }` → `{ success, message }`
  or `{ success: false, error }`. Emails the support team
  (`aivorah24@gmail.com`) via Gmail SMTP.
- `GET /health`

## Branching

`main` is protected by convention — no direct pushes. Work on a feature
branch and open a PR (see `.github/PULL_REQUEST_TEMPLATE.md`).

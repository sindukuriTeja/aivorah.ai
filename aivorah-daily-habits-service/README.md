# Aivorah Daily Habits Service

Standalone microservice for Daily Habits — today's habit list, check-in/
uncheck, streak + coin tracking, auto-generated journal, and parent-assigned
tasks — extracted from `ai-mentor/server`.

## Structure

```
routes/
  habits.js       — thin route handlers: GET /today, POST /checkin,
                     GET /history, GET /parent-tasks, POST /parent-tasks,
                     DELETE /parent-tasks/:taskId
services/
  habits.js        — data-access + domain logic: streak computation,
                      journal generation, checkin/uncheck + coin totals
  push.js          — Expo push notification sender (new-task alerts)
  supabase.js      — Supabase client
```

## Setup

```bash
npm install
cp .env.example .env   # fill in real keys
npm run dev             # nodemon, or `npm start` for a plain run
```

Runs on `PORT` (default `3012`).

## Endpoints

- `GET /habits/today?userEmail=` — today's habits, streak, coins, journal
- `POST /habits/checkin` — toggle a habit's completion for today
- `GET /habits/history?userEmail=&days=7` — completion/coins history
- `GET /habits/parent-tasks?childId=` — a child's assigned tasks (with today's completion status)
- `POST /habits/parent-tasks` — parent assigns a new habit (pushes a notification to the child)
- `DELETE /habits/parent-tasks/:taskId` — remove an assigned habit
- `GET /health`

## Branching

`main` is protected by convention — no direct pushes. Work on a feature
branch and open a PR (see `.github/PULL_REQUEST_TEMPLATE.md`).

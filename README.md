# Aivorah — Local Bundle (all 25 repos)

All 25 `aivorah24` repositories in one folder, ready to run locally.
Downloaded 2026-11-04 from GitHub (latest commits of each default branch).

## What's inside

| Folder | What it is |
|---|---|
| `aivorah-frontend` | Expo / React Native app (web + mobile) — the main UI, all 5 personas |
| `aivorah-auth-service` | Login, signup, email verify, password reset |
| `aivorah-profile-service` | Profile, preferences, notification settings |
| `aivorah-leaderboard-service` | XP, rankings, student dashboard stats |
| `aivorah-learning-paths-service` | Curriculum/syllabus, lessons, quizzes (big: includes NCERT catalog data) |
| `aivorah-assignments-service` | Assignments, worksheet → quiz (AI) |
| `aivorah-challenges-service` | Challenges, quiz sessions |
| `aivorah-ai-coach-service` | AI Coach chat |
| `aivorah-schedule-service` | Calendar / events |
| `aivorah-messages-service` | DMs, channels, notifications (V2) |
| `aivorah-students-service` | Teacher roster management |
| `aivorah-teacher-dashboard-service` | Teacher dashboard, insights |
| `aivorah-attendance-service` | Attendance, My Classes |
| `aivorah-timetable-resources-service` | Timetables, resources |
| `aivorah-parental-controls-service` | Parental controls, screen time |
| `aivorah-school-admin-service` | School admin (students/teachers, grades, bulk import) |
| `aivorah-platform-admin-service` | Aivorah platform admin |
| `aivorah-help-center-service` | Help chat, support tickets |
| `aivorah-bedtime-stories-service` | Bedtime stories + narration |
| `aivorah-daily-habits-service` | Daily habits, parent tasks |
| `aivorah-world-and-you-service` | Daily tidbits + quiz |
| `aivorah-db` | Supabase schema, migrations, seeds |
| `aivorah-e2e-tests` | Playwright E2E suite |
| `aivorah-handover` | Engineering handover docs: overview, access, runbooks (read `01-overview/` first) |
| `eilla-legal-website` | Eilla legal website (separate site, not part of the Aivorah app) |

## Prerequisites

- **Node.js 18+** (all services are plain Node/Express; the frontend is Expo)
- **npm** (comes with Node)
- A **Supabase** account with access to the Aivorah projects (the services need
  `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` — get them from the Supabase dashboard:
  Project Settings → API). Dev project ref: `evlqkcozespsfrnuhevf`.
- Optional, per-feature API keys (each service's `.env.example` lists what it needs):
  `GROQ_API_KEY` (AI features), `RESEND_API_KEY` / Gmail SMTP (email),
  `FIREBASE_*` (password reset), `CLOUDINARY_*` (uploads).

## Quick start — Option A: frontend against the LIVE backend (easiest)

The frontend is built to call the live Render services by default, so you can
run just the UI without starting any local service:

```bash
cd aivorah-frontend
npm install
npm run web          # opens the app in the browser
```

That's it — you'll be logged into the live environment (same data the pilot
users see). Use this to explore the app before running services locally.

## Option B: full local stack

### 1. Database (once)

```bash
cd aivorah-db
cp .env.example .env     # add SUPABASE_ACCESS_TOKEN + the project refs
node scripts/migrate.js dev     # apply any pending migrations to the Dev project
```

(Dev and Test projects were fully migrated as of 2026-11-03; this is a no-op
check unless new migration files exist.)

### 2. Start the services

Each service is identical:

```bash
cd <service-folder>
npm install
cp .env.example .env     # fill in SUPABASE_URL, SUPABASE_SERVICE_KEY, + service-specific keys
npm run dev              # or: npm start
```

Verify: `curl http://localhost:<port>/health` → `{"status":"ok"}`

| Service | Port |
|---|---|
| aivorah-auth-service | 4001 |
| aivorah-profile-service | 4002 |
| aivorah-leaderboard-service | 4003 |
| aivorah-ai-coach-service | 3007 |
| aivorah-challenges-service | 3008 |
| aivorah-schedule-service | 3009 |
| aivorah-bedtime-stories-service | 3010 |
| aivorah-daily-habits-service | 3012 |
| aivorah-help-center-service | 3013 |
| aivorah-learning-paths-service | 3014 |
| aivorah-assignments-service | 3015 |
| aivorah-teacher-dashboard-service | 3016 |
| aivorah-students-service | 3017 |
| aivorah-school-admin-service | 3018 |
| aivorah-parental-controls-service | 3018 ⚠️ |
| aivorah-messages-service | 3020 |
| aivorah-timetable-resources-service | 3021 |
| aivorah-attendance-service | 3022 |
| aivorah-platform-admin-service | 3023 |

⚠️ **Port clash:** school-admin and parental-controls both default to 3018.
If you run both, set a different `PORT` in one of their `.env` files
(e.g. 3024) — and if the frontend points at it, use the same override.

You do **not** need all 20 at once — start only the services for the feature
you're working on.

### 3. Run the frontend against your local services

```bash
cd aivorah-frontend
npm install
EXPO_PUBLIC_USE_LOCAL_SERVICES=1 npm run web
```

`EXPO_PUBLIC_USE_LOCAL_SERVICES=1` (web dev only) points every service URL at
its localhost port above. Without it, the frontend calls the live Render
services. Individual overrides exist too, e.g.
`EXPO_PUBLIC_ASSIGNMENTS_URL=http://localhost:3015`.

### 4. Tests

```bash
# any service
npm test

# frontend
npm run lint
npm run test:unit
npm run test:integration
npm run test:ci        # full CI pipeline: lint + unit + integration + web build

# e2e (needs a running frontend URL)
cd aivorah-e2e-tests
npm install
npx playwright install
npm test
```

## Notes & gotchas

- **Branches:** most repos use `main`; `bedtime-stories`, `daily-habits`,
  `school-admin`, `world-and-you` (and the frontend) use `master`. This bundle
  is already on each repo's default branch.
- **No secrets are in this bundle** — every `.env.example` is a template.
  Fill in real values in your own `.env` files (they are gitignored).
- **The legacy monolith `ai-mentor` is NOT in this bundle** (it's a separate
  private repo). The frontend only talks to the microservices listed above.
- **Free-plan Render services sleep** after 15 min idle — if you're pointing
  at live services, the first request after a pause takes 30–60 s.
- **Big folders:** `aivorah-frontend` (~104 MB, includes Vosk speech models +
  media assets) and `aivorah-learning-paths-service` (~71 MB, NCERT catalog
  images) are large on purpose — they're real project data, keep them.
- Full architecture, feature→service map, and runbooks: `aivorah-handover/01-overview/` and `aivorah-handover/03-runbooks/`.
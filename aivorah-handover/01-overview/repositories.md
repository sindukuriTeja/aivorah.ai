# Repositories

_Last verified: 2026-11-03. GitHub account: `aivorah24` (all repos private)._

## Apps and tooling

| Repo | What it is | Deploys to |
|---|---|---|
| `aivorah-frontend` | Expo / React Native app (web + mobile), all 5 personas | Vercel (prod from `master`, preview per PR) |
| `aivorah-e2e-tests` | Playwright E2E suite — the **only** E2E repo | Triggered from frontend CI against the preview URL |
| `aivorah-db` | Supabase schema, migrations, seeds (Dev/Test/Prod) | Not deployed — migrations are run by hand |
| `ai-mentor` | Legacy monolith: `server/` (Node/Express) + `backend/` (Python RAG/Qdrant) | Served at `aivorah.ai`; the frontend reaches it only via `src/config/serverUrl.ts`. Legacy: no new dependencies on it |

## Microservices (all Node/Express on Render, auto-deploy on merge)

| Repo | Responsibility | Branch → Render URL |
|---|---|---|
| `aivorah-auth-service` | Login, signup, email verify, password reset, change email, `/user/sync` | `main` → aivorah-auth-service.onrender.com |
| `aivorah-profile-service` | Profile, preferences, notification settings | `main` → aivorah-profile-service.onrender.com |
| `aivorah-leaderboard-service` | XP, rankings, student dashboard stats, My Progress | `main` → aivorah-leaderboard-service.onrender.com |
| `aivorah-learning-paths-service` | Curriculum/syllabus, lessons, Listen/Read Aloud, practice quiz, content pipelines (NCERT, ICSE/CISCE) | `main` → aivorah-learning-paths-service.onrender.com |
| `aivorah-assignments-service` | Assignments, worksheet → quiz (AI) | `main` → aivorah-assignments-service.onrender.com |
| `aivorah-challenges-service` | Challenges, quiz sessions | `main` → aivorah-challenges-service.onrender.com |
| `aivorah-ai-coach-service` | AI Coach chat | `main` → aivorah-ai-coach-service.onrender.com |
| `aivorah-schedule-service` | Calendar / events, event notifications | `main` → aivorah-schedule-service.onrender.com |
| `aivorah-messages-service` | DMs, channels, notifications (V2) | `main` → aivorah-messages-service.onrender.com |
| `aivorah-students-service` | Teacher roster: create/link/promote/remove/bulk import, status tags | `main` → aivorah-students-service.onrender.com |
| `aivorah-teacher-dashboard-service` | Teacher dashboard, insights, student-progress heatmap | `main` → aivorah-teacher-dashboard-service.onrender.com |
| `aivorah-attendance-service` | Attendance (teacher/parent/student), My Classes, class posts | `main` → aivorah-attendance-service-y3t6.onrender.com |
| `aivorah-timetable-resources-service` | Timetables (incl. PDF import), resources | `main` → aivorah-timetable-resources-service-jsb4.onrender.com |
| `aivorah-parental-controls-service` | Parental controls, subject filter, screen time | `main` → aivorah-parental-controls-service-okqy.onrender.com |
| `aivorah-school-admin-service` | School Admin: students/parents/teachers, grades & sections, bulk import, announcements | `master` → aivorah-school-admin-service-w0xk.onrender.com |
| `aivorah-platform-admin-service` | Aivorah Admin: overview, users, map-to-teacher, bulk import, LLM stats | `main` → aivorah-platform-admin-service-vaeu.onrender.com |
| `aivorah-help-center-service` | Help chat, support tickets | `main` → aivorah-help-center-service.onrender.com |
| `aivorah-bedtime-stories-service` | Bedtime stories + narration | `master` → aivorah-bedtime-stories-service.onrender.com |
| `aivorah-daily-habits-service` | Daily habits, parent tasks | `master` → aivorah-daily-habits-service.onrender.com |
| `aivorah-world-and-you-service` | Daily tidbits + quiz | `master` → aivorah-world-and-you-service.onrender.com |

## Local layout

All repos are cloned side by side (e.g. `Desktop/<repo>`). Extra `wt-*` folders are temporary git worktrees, not separate repos.

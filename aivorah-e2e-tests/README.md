# Aivorah E2E Tests

Playwright end-to-end suite for the Aivorah web app. This is the only E2E repo; `aivorah-frontend` holds no E2E code.

The suite runs against **real deployed testing infrastructure** (Vercel frontend, Render services, Test Supabase) and changes real test-account data. Never point it at production.

## Run locally
```bash
npm ci
npx playwright install chromium
cp .env.example .env          # fill in values (ask the team lead)
npm test                      # full suite
npm run test:scoped -- tests/student/dashboard.spec.js   # one spec, logs in only the accounts it needs
```
Override the app under test with `BASE_URL=https://<preview-url> npm test`.

## Environment variables
See `.env.example`. Main groups:

| Variables | Purpose |
|---|---|
| `BASE_URL` | Frontend URL under test |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Reset/seed test accounts. Test project only, never commit |
| `E2E_PASSWORD`, `E2E_<PERSONA>_<X>` | Dedicated test accounts, one per parallel-safe slot (see `tests/helpers/accounts.js`) |
| `B2B_*_EMAIL/PASSWORD` | Shared demo accounts |
| `*_SERVICE_URL`, `E2E_SERVICE_OVERRIDES` | Point helpers at a non-default backend service |
| `PW_WORKERS`, `LOGIN_CONCURRENCY` | Parallelism tuning |
| `NVIDIA_NIM_API_KEY`, `NVIDIA_EVAL_MODEL` | Only for `npm run eval:ai-coach` (AI Coach answer-quality eval) |

## CI
| File | Status |
|---|---|
| `.circleci/config.yml` | **Active.** `aivorah-frontend`'s `trigger-e2e` job starts it with the Vercel preview URL; it runs the smoke suite and posts a commit status back to the frontend PR |
| `.gitlab-ci.yml` | Fallback, manual/API trigger only (free tier) |
| `.github/workflows/e2e.yml` | Full sharded suite, manual trigger. Currently blocked by GitHub Actions billing on the account |

## Folder layout
| Path | Why it exists |
|---|---|
| `tests/<persona>/` | Specs grouped by persona (student, parent, teacher, school-admin), then feature |
| `tests/shared/`, `tests/notifications/` | Cross-persona flows |
| `tests/helpers/` | Login, test accounts and account leasing (parallel isolation), API setup helpers, page locators |
| `tests/fixtures/` | Files tests upload (avatar, audio, resources) |
| `tests/ci/`, `tests/global-setup.js`, `tests/global-teardown.js` | Seed/log in accounts before a run and clean up after |
| `scripts/` | Run one spec, seed local users/attendance fixtures, harvest login sessions |
| `qa/ai-coach-eval/` | Offline quality eval for AI Coach answers (not part of the Playwright suite) |
| `progress.md` | What each spec covers and its last known status |

See [CONTRIBUTING.md](CONTRIBUTING.md) for the rules every test must follow.

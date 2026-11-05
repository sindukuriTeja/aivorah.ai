# Aivorah E2E Tests — guide for AI assistants

Playwright suite for the Aivorah web app. This is the only E2E repo. Start with `README.md` (run, env vars, CI, folders) and follow `CONTRIBUTING.md` for every test.

## Hard rules (details in CONTRIBUTING.md)
1. **Persona rule:** the persona under test acts through the UI only. API calls are for test-data setup or read-only expected-value lookups, never the final assertion.
2. **Parallel rule:** every test runs in parallel. No `mode: 'serial'`, no test-order dependence. Fix races with a dedicated account in `tests/helpers/accounts.js`.
3. **Confirm scope first:** before writing a test, confirm with the feature owner what to cover (happy path, error path, empty state, permissions).
4. **One PR per screen/flow.** Never push to `main` directly.
5. **Real infrastructure:** the suite runs against the testing environment and changes test-account data. Never point it at production.
6. **Never commit `.env`** or the Supabase service-role key.

## Where the docs live
App architecture and service maps are in the private `aivorah24/aivorah-handover` repo under `01-overview/architecture/`. Old step-by-step test checklist: `08-archive/e2e-testing-checklist.md`.

## Personal notes
Put personal preferences in `CLAUDE.local.md` (gitignored), not in this file.

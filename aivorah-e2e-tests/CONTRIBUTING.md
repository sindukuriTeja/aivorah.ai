# Contributing

## Branches and PRs
Branch protection is not enforced on this private repo (GitHub Free), so follow it manually:
- Never push directly to `main`. Always: new branch → change → PR → merge.
- One branch and one PR per screen/flow test. Keep PRs small.
- Run the test locally and confirm it passes before merging.
- Before writing a test, confirm with the feature owner what to cover: happy path, error path, empty state, permissions.

## Scope
The suite covers all working functionality for every persona (student, teacher, parent, school admin), not only demo flows.

## Persona rule (non-negotiable)
The persona under test must do its real journey through the UI: click, navigate, read what's rendered. Never replace its own actions with an API call.

API calls are allowed only for:
- Preparing test data or deterministic state, including changing a *different* persona's data that this journey depends on (e.g. a student finishes an assignment so the teacher can see it).
- Read-only lookups used only to compute the expected UI value. Comment these as "read-only expected-value lookup".

Not allowed:
- Asserting on an API response (`expect(apiResponse.count).toBe(5)`), even as a "did the backend save" guard. If it didn't save, the UI assertion fails anyway.
- Calling the tested persona's own data API and asserting on it instead of loading the real screen.

```
API:     prepare/mutate state (setup only)
           ↓
Browser: log in as the persona → navigate → click → view
           ↓
UI:      assert the rendered result
```
Every test's final assertion is a UI check (`getByText`, `toBeVisible`, ...).

## Parallel rule (non-negotiable)
Every test must run in parallel with the rest of the suite: no `test.describe.configure({ mode: 'serial' })`, no reliance on test order.

If two tests would race (e.g. both write the same field on the same account), fix it with **account isolation**: give one test its own dedicated account in `tests/helpers/accounts.js` (same pattern as `parent-d`, `parent-f`, ...). Tests that only read, or change unrelated data, can share an account.

## Useful commands
```bash
npx playwright test tests/student/ai-coach --project=chromium --reporter=line
# Mic tests need real Chrome:
npx playwright test tests/student/ai-coach/ai-coach-mic.spec.js --project=chromium-mic --reporter=line
```
Videos are always recorded to `recordings/<test-name>/video.webm` (gitignored).

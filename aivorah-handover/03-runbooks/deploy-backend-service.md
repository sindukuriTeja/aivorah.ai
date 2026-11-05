# Runbook: deploy a backend service (Render)

All 20 `aivorah-*-service` repos deploy the same way: Render builds and starts the service automatically when its default branch changes.

| Setting | Value |
|---|---|
| Where | Render, workspace of `aivorah24@gmail.com` |
| Branch | `main` for most; `master` for bedtime-stories, daily-habits, school-admin, world-and-you |
| Build / start | `npm install` / `npm start` |
| Health check | `GET https://<service>.onrender.com/health` → `{"status":"ok"}` |

## Steps
1. **Branch and change.** `git checkout -b fix/<short-name>` from the default branch.
2. **Run the checks locally** before every PR:
   ```bash
   npm ci
   npm test
   ```
3. **Open a PR** into the default branch. Get a review if possible.
4. **Merge** (squash). Render starts a deploy within a minute or two.
5. **Watch the deploy:** Render → the service → **Events**. Wait for "Deploy live".
6. **Check the live commit matches.** The deploy in Events shows the commit hash; it must equal the newest commit on the branch. Render auto-deploy sometimes does not fire. If it didn't: **Manual Deploy → Deploy latest commit**.
7. **Smoke test:** open `/health`, then try the changed feature in the app (Vercel production).
8. **Check logs** for 5 minutes: Render → **Logs**. No new errors.

## If a new environment variable is needed
Add it **before** merging: Render → service → **Environment** → add → **Save, rebuild, and deploy**. Also add the name to the repo's README env table and `.env.example`.

## If a database change is needed
Apply the migration first (see [apply-db-migration.md](apply-db-migration.md)), then deploy the service. Code that writes a new column or notification type fails if the migration is missing.

## Undo (roll back)
- Fastest: Render → **Events** → the previous good deploy → **Rollback**. Takes about a minute.
- Then revert the PR on GitHub (`Revert` button), so the next auto-deploy does not bring the bad code back.

## Gotchas
- Free-plan services sleep after 15 minutes idle; the first request after that takes 30–60 s. Not a failure.
- 512 MB memory per service on the free/starter plan. Big PDFs or many Chrome instances crash the assignments service (see [service-down.md](service-down.md)).
- Never deploy the old monolith (`ai-mentor`) as a side effect; it is legacy.

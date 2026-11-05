# Runbook: a service is down, slow or erroring

Goal: find which service is failing, why, and get users working again. Fix the root cause after.

## 1. Find the failing service (2 minutes)
1. Reproduce in Chrome on the live site with **F12 → Network** open.
2. Find the failed request (red, or status 4xx/5xx). Its host names the service, e.g. `aivorah-assignments-service.onrender.com`.
3. Open `https://<that host>/health`.
   - `{"status":"ok"}` → the service is up; the problem is that one request (go to 3).
   - Slow then OK (30–60 s) → it was asleep (free plan). Not an outage.
   - Error page or no answer → the service is down (go to 2).

"Blocked by CORS" / "Failed to fetch" in the browser usually means the service **crashed mid-request**; the crash page has no CORS headers. Treat it as down.

## 2. Service is down
Render → the service → **Events** and **Logs**:

| What you see | Cause | Fix now |
|---|---|---|
| `server_failed` / "Ran out of memory" / `oomKilled` | Over 512 MB (big PDF, many uploads at once) | Render restarts it automatically. If it repeats: lower the load (e.g. `DOCUMENT_MAX_PAGES`) or move the service to a bigger instance |
| Deploy failed (build error) | Bad commit | Roll back to the previous deploy (Events → Rollback), then fix in a PR |
| Crash right after a deploy | Bad code or missing env var | Roll back; compare env vars with the repo README |
| Service "suspended" | Billing / free hours used up | Render → Billing. The free plan has 750 hours a month for the whole workspace; paid plans fix this |
| Nothing in logs, no response | Render incident | status.render.com |

Restart without a code change: **Manual Deploy → Deploy latest commit** (or "Restart service").

## 3. Service up, one request fails
Read the error in Render → **Logs** at the time of the request:

| Error in logs | Cause | Fix |
|---|---|---|
| `401` / `403` from Supabase, or `Invalid API key` | Wrong or rotated key | Check the env var ([rotate-api-key.md](rotate-api-key.md)) |
| `column … does not exist`, `violates check constraint` | A new migration was not applied to Test before the deploy | `node scripts/migrate.js test` ([apply-db-migration.md](apply-db-migration.md)) |
| `402`, `429`, `quota`, `overloaded`, `no longer available` from an AI provider | Free AI quota used up or model retired | New key / billing / model name. See [bulk-upload-ai-providers.md](bulk-upload-ai-providers.md) |
| Qdrant timeout or `Not found: Collection` | Free Qdrant cluster paused, or wrong collection | cloud.qdrant.io → cluster → resume. See `01-overview/architecture/QDRANT_COLLECTIONS.md` |
| `auth/id-token-expired` or token errors locally | PC clock out of sync | Sync the system clock |

## 4. Other parts that can fail
| Part | Check |
|---|---|
| Database | Supabase → Test project → is it paused or over limits? status.supabase.com |
| Login | Firebase console → Authentication; status.firebase.google.com |
| Frontend | Vercel → Deployments: latest production is Ready? Roll back with "Promote to Production" |
| Email | Resend dashboard → Logs (free plan: 100 emails a day) |

## 5. After it is fixed
- If it can happen again, add a row to the tables above.

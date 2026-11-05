# Runbook: apply a database migration

Every schema change is a SQL file in `aivorah-db/supabase/migrations/`. `scripts/migrate.js` applies the files a project hasn't had yet and records each one in `public.schema_migrations` with a checksum. Never change tables in the Supabase dashboard directly.

| Project | Ref | Used by |
|---|---|---|
| Dev | `evlqkcozespsfrnuhevf` | development (free plan: resume it in the dashboard if paused) |
| **Test** | `xmwzifxlpmgsrxgxsgan` | **all live Render services and real pilot users** |
| Prod | `jwlepxmclbkrmfzrumch` | future production, not used yet |

**Status (3 Nov 2026):** Dev and Test have all 22 migrations applied and recorded. `migrate.js dev` and `migrate.js test` both report "already up to date". The next file is `0020_…`.

## Setup (once)
```bash
cd aivorah-db
cp .env.example .env
# SUPABASE_ACCESS_TOKEN = supabase.com/dashboard/account/tokens
# DEV_REF, TEST_REF, PROD_REF = the refs in the table above
```
Node 18+ is enough; there is nothing to install.

## Steps for a new migration
1. **Write** `supabase/migrations/0020_short_description.sql` (next free number). Prefer `if not exists` / `on conflict do nothing` so it is safe to re-run.
2. **Apply to Dev:**
   ```bash
   node scripts/migrate.js dev
   ```
   It prints `apply 0020_…` then `Applied 1 migration(s)`.
3. **Test the feature** against Dev.
4. **Apply to Test** (live: do this before deploying the service that needs it):
   ```bash
   node scripts/migrate.js test
   ```
5. **Run the repo tests:** `npm test`. Open a PR with the file and merge it.
6. **Deploy the service** that uses the change ([deploy-backend-service.md](deploy-backend-service.md)).
7. **Check:** run `node scripts/migrate.js test` again; it should say "already up to date".

## Undo
There are no automatic down-migrations. Write a new migration that reverses the change (e.g. drop the new column) and apply it the same way. Before a risky change, export the affected tables first.

## Rules
- **Migrations are immutable.** Never edit or rename a file once it is applied anywhere; `migrate.js` stops with a checksum error. Add a new file instead.
- **Order is always Dev → Test → Prod.**
- **New notification types** must be added to the `notifications_type_check` constraint in a migration first (see `0019`), or inserts fail silently in the producing service.
- Some numbers appear twice (`0008_*`, `0009_*`, `0017_*`). That is fine: the ledger uses the full file name.
- **Prod:** when production is built, bring it up with `node scripts/migrate.js prod --confirm-prod` (see the aivorah-db README for the baseline step).

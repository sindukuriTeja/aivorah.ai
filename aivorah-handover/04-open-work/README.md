# Open work

What the team can pick up next, in rough order of value. Nothing here blocks the app from running today.

## 1. Decisions for the company
- **Paid hosting.** Render's free plan covers 750 service-hours a month and the app needs about 14,600, so a paid plan (or the move to Google Cloud) keeps services from being suspended. Options and prices are in the hosting cost estimate.
- **Team seats.** Render Pro and Vercel Pro let each engineer have their own login. Until then, use the company login (`aivorah24@gmail.com`).
- **AI provider accounts.** Put Gemini, Groq, Mistral and Hugging Face on company-owned keys or paid plans for steady speed in assignment generation and bulk upload.
- **Production setup.** Build production on Google Cloud with the Supabase Prod project when ready. Today's live system is Render + the Supabase Test project.

## 2. Security hardening
- **Token checks on every service.** Some services take the user's email from the request instead of checking the login token. School Admin has the check built in: turn it on with `AUTH_ENFORCE=enforce`. Others need a shared token check like the one in attendance and timetable-resources.
- **Admin lists.** Admin email lists in `aivorah-platform-admin-service` (`middleware/auth.js`) and `aivorah-school-admin-service` (`services/adminScope.js`) contain individual emails. Keep only `ADMIN_EMAILS` from Render env vars.
- **Key rotation:** move shared keys to company-owned accounts; see `03-runbooks/rotate-api-key.md`.

## 3. Product improvements
- **Teacher promote** should also move the curriculum at grade boundaries (IB PYP → IB MYP), the same way School Admin promote does (`aivorah-students-service`).
- **Curriculum logos** for IB PYP, IB DP and ICSE (upload through branding logos).
- **Bulk upload:** show "couldn't read this worksheet" when a quiz comes back with 0 tasks; skip an AI provider for a while after quota errors (see the bulk-upload runbook).
- **Qdrant vault:** switch NCERT content to the richer vault collection when it is fully built (`QDRANT_COLLECTIONS.md`).

## 4. Housekeeping
- **Profile service tests:** two integration test files need the Supabase test mock to support `.in()`; the app code itself is fine.
- **Old screens:** `aivorah-frontend/src/.legacy-screens/` can be deleted once the few remaining imports move to the current screens.
- **Old branches:** frontend (~100), e2e-tests (~40) and learning-paths (~37) have many merged or stale branches to prune.
- **CircleCI `trigger-e2e`:** update the CircleCI API token it uses to start the E2E project.


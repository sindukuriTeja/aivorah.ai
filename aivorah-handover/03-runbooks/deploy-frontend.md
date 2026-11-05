# Runbook: deploy the frontend (Vercel)

`aivorah-frontend` is built and hosted by Vercel. Every PR gets a preview link; merging into `master` updates the live site.

| Setting | Value |
|---|---|
| Where | Vercel account `aivorah24-9470`, project `aivorah-frontend` |
| Production branch | `master` |
| Build | `npm run vercel-build` (Expo web export) → `dist/` |
| CI | CircleCI `build_and_test` (lint, unit, integration, build) is the required check. `trigger-e2e` hands the preview to `aivorah-e2e-tests`; if it shows red, check its CircleCI API token |

## Steps
1. **Branch and change.** `git checkout -b fix/<short-name>` from `master`.
2. **Run the checks locally:**
   ```bash
   npm ci
   npm run test:ci     # lint + unit + integration + web build
   ```
3. **Open a PR.** Vercel posts a **preview link** on the PR. Test the change there. The preview calls the live backend services.
4. **Merge with the `aivorah24` GitHub account (squash).** Vercel's free plan only deploys commits merged by the account owner. A merge by anyone else does not reach production.
5. **Check production:** Vercel → **Deployments** → newest one on `master` is **Ready** and its commit matches the merge.
6. **Smoke test** the changed screen on the live site. Hard refresh (`Ctrl+Shift+R`) to skip the cached bundle.

## If the merge did not deploy
- The merge author was not `aivorah24`: push an empty commit as `aivorah24` (`git commit --allow-empty -m "chore: trigger deploy"`) or redeploy from the Vercel dashboard.
- The build failed: Vercel → the deployment → **Build Logs**. Run `npm run vercel-build` locally to reproduce.

## Environment variables
Only `EXPO_PUBLIC_*` variables, set in Vercel → project → **Settings → Environment Variables**. They are bundled into the browser code, so they must never be secrets. Changing one needs a redeploy.

## Undo (roll back)
- Vercel → **Deployments** → previous good production deployment → **Promote to Production** (instant).
- Then revert the PR on GitHub so the next merge does not bring it back.

## Gotchas
- Moving to Vercel Pro (team seats) removes the "only aivorah24 deploys" limit.
- A backend change the screen depends on must be deployed first (see [deploy-backend-service.md](deploy-backend-service.md)).

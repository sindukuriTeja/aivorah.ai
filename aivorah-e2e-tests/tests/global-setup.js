// Runs ONCE before the whole test run starts (see playwright.config.js) -
// the LOCAL dev path, where one `playwright test` invocation does setup +
// tests + teardown itself.
//
// The actual work (warm-up + resilient parallel login + profile snapshot)
// lives in tests/helpers/runSetup.js so it can also run standalone in CI,
// once, in its own job, before sharded test jobs start - see that file's
// header comment and tests/ci/setup.mjs for why sharding needs setup
// decoupled from Playwright's per-shard globalSetup lifecycle.
//
// Skipped entirely when PLAYWRIGHT_SKIP_GLOBAL_HOOKS=true - CI's sharded
// test jobs set this because tests/ci/setup.mjs already did this work once,
// in a separate job, and handed the results (.auth/ + .profile-snapshot.json)
// to every shard via an artifact.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

// Log in only the accounts the selected spec files declare (export const REQUIRED_ACCOUNTS = [...]).
// Falls back to every account when no spec is named or any selected spec doesn't declare its accounts.
function accountsForSelectedSpecs() {
  const repo = path.resolve(__dirname, '..');
  const specs = [];
  const walk = (p) => {
    if (!fs.existsSync(p)) return;
    if (fs.statSync(p).isDirectory()) { for (const f of fs.readdirSync(p)) walk(path.join(p, f)); return; }
    if (p.endsWith('.spec.js')) specs.push(p);
  };
  for (const a of process.argv.slice(2)) {
    if (a.startsWith('-')) continue;
    const p = path.resolve(repo, a);
    if (p.startsWith(path.join(repo, 'tests'))) walk(p);
  }
  if (!specs.length) return undefined;
  const all = new Set();
  const missing = [];
  for (const f of specs) {
    const m = fs.readFileSync(f, 'utf8').match(/export\s+const\s+REQUIRED_ACCOUNTS\s*=\s*(\[[\s\S]*?\])\s*;/);
    const list = m ? [...m[1].matchAll(/['"`]([^'"`]+)['"`]/g)].map((x) => x[1]) : [];
    if (!list.length) missing.push(path.relative(repo, f));
    list.forEach((a) => all.add(a));
  }
  if (missing.length) {
    console.log(`[global-setup] logging in every account: no REQUIRED_ACCOUNTS in ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? ` (+${missing.length - 5} more)` : ''}`);
    return undefined;
  }
  console.log(`[global-setup] logging in only: ${[...all].join(', ')}`);
  return [...all];
}

export default async function globalSetup(config) {
  if (process.env.PLAYWRIGHT_SKIP_GLOBAL_HOOKS === 'true') {
    console.log('[global-setup] PLAYWRIGHT_SKIP_GLOBAL_HOOKS=true - skipping (CI already ran tests/ci/setup.mjs)');
    return;
  }

  const { runSetup } = await import('./helpers/runSetup.js');
  const baseURL = config.projects[0].use.baseURL;

  // Set by scripts/run-scoped-spec.mjs for a local single-spec run on a
  // constrained machine - comma-separated tests/helpers/accounts.js keys.
  // Unset (the normal `npm test` / CI path) means "seed everything", same
  // as before this existed.
  const onlyAccounts = process.env.E2E_ONLY_ACCOUNTS
    ? process.env.E2E_ONLY_ACCOUNTS.split(',').map((s) => s.trim()).filter(Boolean)
    : accountsForSelectedSpecs();

  await runSetup({ baseURL, onlyAccounts });
}

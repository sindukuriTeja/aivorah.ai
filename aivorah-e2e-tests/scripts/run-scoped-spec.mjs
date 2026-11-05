// Runs ONE spec file, seeding/logging-in ONLY the accounts that spec
// declares it needs, instead of all ~90 - for local runs on a
// memory-constrained machine (e.g. 8GB RAM), where a full-suite login pass
// is unnecessary overhead just to exercise one feature.
//
// Convention: a spec file opts in by exporting REQUIRED_ACCOUNTS, an array
// of tests/helpers/accounts.js keys, e.g.:
//
//   export const REQUIRED_ACCOUNTS = ['parent-c', 'student-f'];
//
// This script statically reads that export out of the spec's source (does
// NOT import/execute it - see readRequiredAccounts() below for why), then
// execs `playwright test <spec>` with E2E_ONLY_ACCOUNTS set -
// tests/global-setup.js reads that env var and passes it to runSetup.js,
// which then logs in and snapshots only those accounts (see runSetup.js's
// onlyAccounts param).
//
// A spec with no REQUIRED_ACCOUNTS export just falls back to the normal
// full-suite setup - this is purely additive, nothing breaks for specs that
// haven't adopted the convention yet.
//
// Usage:
//   node scripts/run-scoped-spec.mjs tests/student/parental-controls/parental-controls-enforcement.spec.js
//   npm run test:scoped -- tests/student/parental-controls/parental-controls-enforcement.spec.js
//
// Extra args after the spec path are passed straight through to
// `playwright test` (e.g. --headed, --debug, -g "some test name").

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

// Read REQUIRED_ACCOUNTS by statically parsing the source, NOT by
// import()-ing the spec file - importing it runs test.describe()/test() at
// module scope, which throws ("Playwright Test did not expect
// test.describe() to be called here") outside the actual Playwright test
// runner process. The convention deliberately keeps the export to a plain
// array-of-string-literals so this regex is enough - no need for a real
// parser.
function readRequiredAccounts(specPath) {
  const src = fs.readFileSync(specPath, 'utf-8');
  const match = src.match(/export\s+const\s+REQUIRED_ACCOUNTS\s*=\s*(\[[\s\S]*?\])\s*;/);
  if (!match) return undefined;
  const items = [...match[1].matchAll(/['"`]([^'"`]+)['"`]/g)].map((m) => m[1]);
  return items.length ? items : undefined;
}

const [, , specArg, ...extraArgs] = process.argv;

if (!specArg) {
  console.error('Usage: node scripts/run-scoped-spec.mjs <path-to-spec.js> [extra playwright args]');
  process.exit(1);
}

const specPath = path.isAbsolute(specArg) ? specArg : path.resolve(repoRoot, specArg);

if (!fs.existsSync(specPath)) {
  console.error(`Spec file not found: ${specPath}`);
  process.exit(1);
}
const requiredAccounts = readRequiredAccounts(specPath);

if (!requiredAccounts || !requiredAccounts.length) {
  console.warn(
    `[run-scoped-spec] ${path.relative(repoRoot, specPath)} does not export REQUIRED_ACCOUNTS - ` +
      `falling back to the full ~90-account setup for this run.`,
  );
} else {
  console.log(`[run-scoped-spec] scoping setup to: ${requiredAccounts.join(', ')}`);
}

const env = { ...process.env };
if (requiredAccounts && requiredAccounts.length) {
  env.E2E_ONLY_ACCOUNTS = requiredAccounts.join(',');
}

// shell: true on Windows - spawnSync can't directly exec a .cmd shim
// (npx.cmd) without going through a shell to resolve it; without this it
// silently fails/exits early instead of throwing, which is what made this
// look like a no-op run rather than an error.
// Playwright's testMatch resolution wants forward slashes - path.relative()
// on Windows returns backslashes, which produced "Error: No tests found"
// even though the file plainly exists (confirmed by running the same
// backslash path through a plain bash+npx invocation, which also failed,
// vs. a forward-slash path, which worked).
const relSpecPath = path.relative(repoRoot, specPath).split(path.sep).join('/');

const result = spawnSync(
  'npx',
  ['playwright', 'test', relSpecPath, ...extraArgs],
  { cwd: repoRoot, env, stdio: 'inherit', shell: process.platform === 'win32' },
);

if (result.error) {
  console.error(`[run-scoped-spec] failed to launch playwright: ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status ?? 1);

// Harvests ONE account's session instead of global-setup.js's full 90-account
// warm-up (too heavy for a local machine running one spec). Run this once,
// then use `PLAYWRIGHT_SKIP_GLOBAL_HOOKS=true` so Playwright skips the full
// warm-up and re-teardown for every local test run.
//
// Usage: node scripts/harvest-session.mjs parent-b [teacher-d ...]

import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { chromium } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const { harvestSession } = await import('../tests/helpers/auth.js');
const { accountFor, PASSWORD } = await import('../tests/helpers/accounts.js');

const baseURL = process.env.BASE_URL || 'http://localhost:3006';
const names = process.argv.slice(2);
if (!names.length) { console.error('Usage: node scripts/harvest-session.mjs <account> [account...]'); process.exit(1); }

const browser = await chromium.launch();
for (const name of names) {
  const { email } = accountFor(name);
  console.log(`Logging in ${name} (${email})...`);
  await harvestSession(browser, { account: name, email, password: PASSWORD, baseURL });
  console.log(`  done -> .auth/${name}.json`);
}
await browser.close();

// Copies the `users` row (role, onboarding_complete, school, curriculum,
// grade, etc.) for every E2E_* account from the E2E Supabase project into
// whatever project the local backend services point at, so local runs of
// aivorah-e2e-tests see the same account state as staging/CI.
//
// Firebase Auth itself is a single shared project across all environments
// (see src/config/firebase.ts) — only this business-data row is missing
// locally. Skips `id`/`school_id` (project-specific, regenerated locally).
//
// Usage: node scripts/seed-local-users.mjs
//   DEST_SUPABASE_URL / DEST_SUPABASE_SERVICE_KEY env vars pick the target
//   project; defaults to aivorah-auth-service's local .env values.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const source = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const destUrl = process.env.DEST_SUPABASE_URL
  || dotenv.parse(fs.readFileSync(path.resolve(__dirname, '..', '..', 'aivorah-auth-service', '.env'))).SUPABASE_URL;
const destKey = process.env.DEST_SUPABASE_SERVICE_KEY
  || dotenv.parse(fs.readFileSync(path.resolve(__dirname, '..', '..', 'aivorah-auth-service', '.env'))).SUPABASE_SERVICE_KEY;
const dest = createClient(destUrl, destKey);

const COLUMNS = 'name, email, role, grade, school, curriculum, location, phone, onboarding_complete, photo_url, dob, gender, state, country';

const emails = Object.entries(process.env)
  .filter(([key, value]) => key.startsWith('E2E_') && /.+@.+\..+/.test(value || ''))
  .map(([, value]) => value.toLowerCase().trim());

let copied = 0, missing = 0, failed = 0;

for (const email of emails) {
  const { data: row, error: readErr } = await source.from('users').select(COLUMNS).eq('email', email).maybeSingle();
  if (readErr) { console.error(`READ FAILED ${email}: ${readErr.message}`); failed++; continue; }
  if (!row) { missing++; continue; }

  const { error: writeErr } = await dest.from('users').upsert(row, { onConflict: 'email' });
  if (writeErr) { console.error(`WRITE FAILED ${email}: ${writeErr.message}`); failed++; continue; }
  copied++;
}

console.log(`Copied ${copied}, missing in source ${missing}, failed ${failed}, total checked ${emails.length}`);

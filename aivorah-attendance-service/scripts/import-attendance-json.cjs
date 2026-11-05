#!/usr/bin/env node
// One-off import of the monolith's server/data/attendance.json ({ "YYYY-MM-DD": { studentId: status } })
// into attendance_records. Dry run by default; --write upserts. Unknown students and bad rows are skipped.
// Usage: node scripts/import-attendance-json.cjs <path/to/attendance.json> [--write]
const fs = require('fs');

const STATUSES = new Set(['present', 'absent', 'late']);
const DATE = /^\d{4}-\d{2}-\d{2}$/;

// Flattens the monolith file into rows and lists what was skipped (and why).
function parseAttendanceJson(json) {
  const rows = [];
  const skipped = [];
  if (!json || typeof json !== 'object' || Array.isArray(json)) return { rows, skipped: [{ reason: 'file is not an object' }] };
  for (const [date, byStudent] of Object.entries(json)) {
    if (!DATE.test(date) || Number.isNaN(new Date(`${date}T00:00:00Z`).getTime())) { skipped.push({ date, reason: 'bad date' }); continue; }
    if (!byStudent || typeof byStudent !== 'object') { skipped.push({ date, reason: 'no records' }); continue; }
    for (const [studentId, status] of Object.entries(byStudent)) {
      if (!STATUSES.has(status)) { skipped.push({ date, studentId, reason: `bad status ${status}` }); continue; }
      rows.push({ student_id: studentId, date, status });
    }
  }
  return { rows, skipped };
}

// Adds school/grade/section from users; rows for unknown students are dropped.
function attachClass(rows, usersById) {
  const out = [];
  const unknown = new Set();
  for (const r of rows) {
    const u = usersById.get(r.student_id);
    if (!u) { unknown.add(r.student_id); continue; }
    out.push({ ...r, school_id: u.school_id || null, grade: u.grade || null, section: u.section || null, marked_by_email: 'import:monolith-attendance.json' });
  }
  return { rows: out, unknown: [...unknown] };
}

async function main() {
  const file = process.argv[2];
  const write = process.argv.includes('--write');
  if (!file || !fs.existsSync(file)) { console.error('Usage: node scripts/import-attendance-json.cjs <attendance.json> [--write]'); process.exit(1); }
  require('dotenv').config();
  const supabase = require('../services/supabase');

  const { rows, skipped } = parseAttendanceJson(JSON.parse(fs.readFileSync(file, 'utf8')));
  const ids = [...new Set(rows.map((r) => r.student_id))];
  const usersById = new Map();
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await supabase.from('users').select('id, school_id, grade, section').in('id', ids.slice(i, i + 200));
    if (error) throw error;
    for (const u of data || []) usersById.set(u.id, u);
  }
  const { rows: ready, unknown } = attachClass(rows, usersById);

  console.log(`records in file: ${rows.length + skipped.length}; importable: ${ready.length}; unknown students: ${unknown.length}; skipped: ${skipped.length}`);
  for (const s of skipped.slice(0, 20)) console.log('  skipped', JSON.stringify(s));
  if (unknown.length) console.log('  unknown student ids:', unknown.slice(0, 20).join(', '));
  if (!write) { console.log('DRY RUN — re-run with --write to import'); return; }
  for (let i = 0; i < ready.length; i += 500) {
    const { error } = await supabase.from('attendance_records').upsert(ready.slice(i, i + 500), { onConflict: 'student_id,date' });
    if (error) throw error;
  }
  console.log(`imported ${ready.length} records`);
}

if (require.main === module) main().catch((e) => { console.error(e.message); process.exit(1); });

module.exports = { parseAttendanceJson, attachClass };

/**
 * Pure rules for attendance: who may mark or read, input checks, and the summary maths.
 * `grades` is services/academicStructure.buildGradesSectionsView output.
 */
const STATUSES = ['present', 'absent', 'late'];
const ADMIN_ROLES = ['school_admin', 'super_admin'];
const norm = (v) => String(v || '').trim();

function findSection(grades, grade, section) {
  const g = (grades || []).find((x) => norm(x.name) === norm(grade));
  return g ? (g.sections || []).find((s) => norm(s.name) === norm(section)) || null : null;
}

function isClassTeacher(user, grades, grade, section) {
  if (!user || user.role !== 'teacher' || !user.school_id) return false;
  const s = findSection(grades, grade, section);
  return !!s && norm(s.classTeacherEmail).toLowerCase() === norm(user.email).toLowerCase();
}

// Mark or read a class roster: its class teacher, or an admin of the school.
function canManageClass(user, grades, grade, section) {
  if (!user || !user.school_id) return false;
  if (ADMIN_ROLES.includes(user.role)) return !!findSection(grades, grade, section);
  return isClassTeacher(user, grades, grade, section);
}

// Classes this teacher is class teacher of (archived grades/sections excluded).
function teacherClasses(user, grades) {
  if (!user || user.role !== 'teacher' || !user.school_id) return [];
  const out = [];
  for (const g of grades || []) {
    if (g.archived) continue;
    for (const s of g.sections || []) {
      if (s.archived || !s.classTeacherEmail) continue;
      if (norm(s.classTeacherEmail).toLowerCase() !== norm(user.email).toLowerCase()) continue;
      out.push({
        grade: g.name, section: s.name, label: `${g.name} ${s.name}`.trim(),
        classTeacherEmail: s.classTeacherEmail, classTeacherName: user.name || null, studentCount: s.studentCount || 0,
      });
    }
  }
  return out;
}

function isValidDate(d) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(d || ''))) return false;
  const t = new Date(`${d}T00:00:00Z`);
  return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === d;
}

// records: { studentId: status }. Returns an error message or null.
function validateRecords(records, rosterIds) {
  if (!records || typeof records !== 'object' || Array.isArray(records)) return 'records must be an object of studentId: status';
  const entries = Object.entries(records);
  if (!entries.length) return 'records is empty';
  const allowed = new Set(rosterIds);
  for (const [id, status] of entries) {
    if (!STATUSES.includes(status)) return `invalid status "${status}" (use present, absent or late)`;
    if (!allowed.has(id)) return `student ${id} is not in this class`;
  }
  return null;
}

// Same formula as the monolith (late counts as half), but null instead of 100% when nothing is recorded.
function summarize(rows) {
  let present = 0, absent = 0, late = 0;
  for (const r of rows || []) {
    if (r.status === 'present') present += 1;
    else if (r.status === 'absent') absent += 1;
    else if (r.status === 'late') late += 1;
  }
  const total = present + absent + late;
  const ratePct = total > 0 ? Math.round(((present + late * 0.5) / total) * 100) : null;
  const history = [...(rows || [])]
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, 30)
    .map((r) => ({ date: r.date, status: r.status }));
  return { summary: { present, absent, late, total, ratePct }, history };
}

module.exports = { STATUSES, findSection, isClassTeacher, canManageClass, teacherClasses, isValidDate, validateRecords, summarize };

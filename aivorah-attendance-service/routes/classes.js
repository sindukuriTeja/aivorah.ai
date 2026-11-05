const express = require('express');
const supabase = require('../services/supabase');
const { buildGradesSectionsView } = require('../services/academicStructure');
const { teacherClasses } = require('../services/rules');
const store = require('../services/attendanceStore');

const router = express.Router();

async function resolveTeacherName(email) {
  if (!email) return null;
  const { data } = await supabase.from('users').select('name').eq('email', email.toLowerCase()).maybeSingle();
  return data?.name || null;
}

// Finds the merged grade/section entry (classTeacherEmail + live
// studentCount) for one grade+section pair — the same merge School Admin's
// Classes console already relies on.
function findSection(grades, grade, section) {
  const g = grades.find((x) => String(x.name).trim() === String(grade || '').trim());
  if (!g) return null;
  const s = g.sections.find((x) => String(x.name).trim() === String(section || '').trim());
  if (!s) return null;
  return { grade: g.name, section: s.name, classTeacherEmail: s.classTeacherEmail, studentCount: s.studentCount };
}

// "My Classes" card shape (grade/section + homeroom teacher + live student
// count) — ported from the monolith's routes/classes.js onto the Test DB
// this service (and the live app) actually runs on, behind requireUser
// (Firebase token) instead of a bare ?email= query param.
async function classCard(grades, grade, section) {
  const found = findSection(grades, grade, section);
  if (!found) return null;
  return {
    grade: found.grade,
    section: found.section,
    label: `${found.grade} Homeroom`,
    code: found.section ? `${found.grade}${found.section}` : found.grade,
    classTeacherEmail: found.classTeacherEmail,
    classTeacherName: await resolveTeacherName(found.classTeacherEmail),
    studentCount: found.studentCount,
  };
}

// GET /classes/mine — teacher: class(es) they are class teacher of
// (attendance's own original use — unchanged shape, just enriched);
// "My Classes" (student/parent homeroom card) adds classTeacherEmail/Name,
// studentCount and a short code, previously only on the monolith's route.
router.get('/mine', async (req, res) => {
  const user = req.user;
  try {
    if (!user.school_id) return res.json({ classes: [] });

    if (user.role === 'teacher') {
      const grades = await buildGradesSectionsView(user.school_id);
      return res.json({ classes: teacherClasses(user, grades) });
    }

    if (user.role === 'student') {
      const grades = await buildGradesSectionsView(user.school_id);
      const card = await classCard(grades, user.grade, user.section);
      return res.json({ classes: card ? [card] : [] });
    }

    if (user.role === 'parent') {
      const kids = await store.childrenOf(user.email);
      const grades = await buildGradesSectionsView(user.school_id);
      const classes = [];
      for (const child of kids) {
        if (!child?.grade || child.school_id !== user.school_id) continue;
        const card = await classCard(grades, child.grade, child.section);
        if (!card) continue;
        classes.push({ ...card, studentId: child.id, studentName: child.name });
      }
      return res.json({ classes });
    }

    return res.json({ classes: [] });
  } catch (err) {
    console.error('[GET /classes/mine]', err.message);
    return res.status(500).json({ error: 'Failed to load classes' });
  }
});

module.exports = router;

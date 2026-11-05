const express = require('express');
const { buildGradesSectionsView } = require('../services/academicStructure');
const rules = require('../services/rules');
const store = require('../services/attendanceStore');

const router = express.Router();
const ADMIN_ROLES = ['school_admin', 'super_admin'];
const NOT_CLASS_TEACHER = { error: 'You are not the class teacher of this class' };

// GET /attendance/class?grade=&section=&date= — the class roster with each student's status for the day.
router.get('/class', async (req, res) => {
  const { grade, section, date } = req.query;
  if (!grade || !section || !rules.isValidDate(date)) {
    return res.status(400).json({ error: 'grade, section and date (YYYY-MM-DD) are required' });
  }
  try {
    const grades = await buildGradesSectionsView(req.user.school_id);
    if (!rules.canManageClass(req.user, grades, grade, section)) return res.status(403).json(NOT_CLASS_TEACHER);
    const students = await store.roster(req.user.school_id, grade, section);
    const marks = new Map((await store.recordsFor(students.map((s) => s.id), date)).map((r) => [r.student_id, r.status]));
    return res.json({
      date,
      students: students.map((s) => ({
        id: s.id, name: s.name, email: s.email, photoUrl: s.photo_url || null, status: marks.get(s.id) || null,
      })),
    });
  } catch (err) {
    console.error('[GET /attendance/class]', err.message);
    return res.status(500).json({ error: 'Failed to fetch class attendance' });
  }
});

// POST /attendance/save { date, grade, section, records: { studentId: status } }
router.post('/save', async (req, res) => {
  const { date, grade, section, records } = req.body || {};
  if (!grade || !section || !rules.isValidDate(date)) {
    return res.status(400).json({ error: 'grade, section and date (YYYY-MM-DD) are required' });
  }
  try {
    const grades = await buildGradesSectionsView(req.user.school_id);
    if (!rules.canManageClass(req.user, grades, grade, section)) return res.status(403).json(NOT_CLASS_TEACHER);
    const students = await store.roster(req.user.school_id, grade, section);
    const invalid = rules.validateRecords(records, students.map((s) => s.id));
    if (invalid) return res.status(400).json({ error: invalid });
    const now = new Date().toISOString();
    await store.upsertRecords(Object.entries(records).map(([studentId, status]) => ({
      student_id: studentId, date, status, school_id: req.user.school_id, grade, section,
      marked_by: req.user.id, marked_by_email: req.user.email, updated_at: now,
    })));
    return res.json({ success: true, date, saved: Object.keys(records).length });
  } catch (err) {
    console.error('[POST /attendance/save]', err.message);
    return res.status(500).json({ error: 'Failed to save attendance' });
  }
});

// GET /attendance/student/:studentId/summary — the student, their parent, their class teacher, or a school admin.
router.get('/student/:studentId/summary', async (req, res) => {
  const { studentId } = req.params;
  const user = req.user;
  try {
    const student = await store.getStudent(studentId);
    if (!student || student.role !== 'student') return res.status(404).json({ error: 'Student not found' });
    let allowed = user.id === student.id;
    if (!allowed && user.role === 'parent') allowed = await store.isParentOf(user.email, student.id);
    if (!allowed && user.school_id && user.school_id === student.school_id) {
      if (ADMIN_ROLES.includes(user.role)) allowed = true;
      else if (user.role === 'teacher') {
        const grades = await buildGradesSectionsView(user.school_id);
        allowed = rules.isClassTeacher(user, grades, student.grade, student.section);
      }
    }
    if (!allowed) return res.status(403).json({ error: "You cannot view this student's attendance" });
    return res.json({ studentId, ...rules.summarize(await store.studentHistory(studentId)) });
  } catch (err) {
    console.error('[GET /attendance/student/summary]', err.message);
    return res.status(500).json({ error: 'Failed to get student attendance summary' });
  }
});

module.exports = router;

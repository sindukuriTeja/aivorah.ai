// Supabase queries for attendance.
const supabase = require('./supabase');

async function roster(schoolId, grade, section) {
  const { data, error } = await supabase
    .from('users')
    .select('id, name, email, photo_url')
    .eq('school_id', schoolId).eq('role', 'student').eq('grade', grade).eq('section', section)
    .neq('status', 'archived')
    .order('name');
  if (error) throw error;
  return data || [];
}

async function recordsFor(studentIds, date) {
  if (!studentIds.length) return [];
  const { data, error } = await supabase
    .from('attendance_records').select('student_id, status').eq('date', date).in('student_id', studentIds);
  if (error) throw error;
  return data || [];
}

async function upsertRecords(rows) {
  const { error } = await supabase.from('attendance_records').upsert(rows, { onConflict: 'student_id,date' });
  if (error) throw error;
}

async function studentHistory(studentId) {
  const { data, error } = await supabase
    .from('attendance_records').select('date, status').eq('student_id', studentId).order('date', { ascending: false });
  if (error) throw error;
  return data || [];
}

async function getStudent(studentId) {
  const { data, error } = await supabase
    .from('users').select('id, role, school_id, grade, section').eq('id', studentId).maybeSingle();
  if (error) throw error;
  return data;
}

async function isParentOf(parentEmail, childId) {
  const { data, error } = await supabase
    .from('parent_children').select('child_id').eq('parent_email', String(parentEmail || '').toLowerCase()).eq('child_id', childId)
    .limit(1);
  if (error) throw error;
  return (data || []).length > 0;
}

async function childrenOf(parentEmail) {
  const { data, error } = await supabase
    .from('parent_children')
    .select('child_id, users!parent_children_child_id_fkey(id, name, grade, section, school_id)')
    .eq('parent_email', String(parentEmail || '').toLowerCase());
  if (error) throw error;
  return (data || []).map((r) => r.users).filter(Boolean);
}

module.exports = { roster, recordsFor, upsertRecords, studentHistory, getStudent, isParentOf, childrenOf };

// Test-data setup for the Timetable and Resources specs (setup/cleanup only -
// every assertion in those specs is on the rendered UI).
//
// Each test owns one TSRA class (grade + section) so tests can run in
// parallel without touching each other's timetable.

import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export const SEED_PERIODS = [
  { code: 'P1', start: '08:50', end: '09:40', isBreak: false },
  { code: 'P2', start: '09:40', end: '10:30', isBreak: false },
  { code: 'BRK', start: '10:30', end: '10:50', isBreak: true },
  { code: 'P3', start: '10:50', end: '11:40', isBreak: false },
];

export async function getSchoolIdByEmail(email) {
  const { data, error } = await supabaseAdmin
    .from('users').select('school_id').eq('email', email.toLowerCase()).single();
  if (error) throw error;
  return data.school_id;
}

export async function deleteTimetable(schoolId, grade, section) {
  const { data: rows } = await supabaseAdmin
    .from('class_timetables').select('id')
    .eq('school_id', schoolId).eq('grade', grade).eq('section', section);
  const ids = (rows || []).map((r) => r.id);
  if (!ids.length) return;
  await supabaseAdmin.from('timetable_slots').delete().in('timetable_id', ids);
  await supabaseAdmin.from('class_timetables').delete().in('id', ids);
}

// Replaces whatever timetable the class has with SEED_PERIODS + the given slots.
// slots: [{ day: 'MON', periodCode: 'P1', subject, room }]
export async function seedTimetable(schoolId, grade, section, slots = []) {
  await deleteTimetable(schoolId, grade, section);
  const { data: tt, error } = await supabaseAdmin
    .from('class_timetables')
    .insert({ school_id: schoolId, grade, section, title: `${grade} ${section} Timetable`, period_defs: SEED_PERIODS })
    .select('id').single();
  if (error) throw error;
  if (slots.length) {
    const { error: sErr } = await supabaseAdmin.from('timetable_slots').insert(
      slots.map((s) => ({
        timetable_id: tt.id, day_of_week: s.day, period_code: s.periodCode,
        subject_name: s.subject, room_name: s.room || null,
      })),
    );
    if (sErr) throw sErr;
  }
  return tt.id;
}

export async function seedResourceFolder(schoolId, { name, createdBy }) {
  const { data, error } = await supabaseAdmin
    .from('resource_folders')
    .insert({ school_id: schoolId, name, scope: 'school', created_by: createdBy, parent_folder_id: null })
    .select('id').single();
  if (error) throw error;
  return data.id;
}

export async function seedResourceFile(schoolId, { folderId, title, fileUrl, uploadedBy }) {
  const { data, error } = await supabaseAdmin
    .from('resource_files')
    .insert({
      school_id: schoolId, folder_id: folderId, title, file_url: fileUrl,
      file_type: 'application/pdf', file_size: 13264, scope: 'school', uploaded_by: uploadedBy,
    })
    .select('id').single();
  if (error) throw error;
  return data.id;
}

// Removes folders (and their files) whose name starts with the given test prefix.
export async function deleteResourcesByPrefix(schoolId, prefix) {
  const { data: folders } = await supabaseAdmin
    .from('resource_folders').select('id').eq('school_id', schoolId).like('name', `${prefix}%`);
  const ids = (folders || []).map((f) => f.id);
  if (ids.length) {
    await supabaseAdmin.from('resource_files').delete().in('folder_id', ids);
    await supabaseAdmin.from('resource_folders').delete().in('id', ids);
  }
  await supabaseAdmin.from('resource_files').delete().eq('school_id', schoolId).like('title', `${prefix}%`);
}

export async function timetableExists(schoolId, grade, section) {
  const { data } = await supabaseAdmin
    .from('class_timetables').select('id')
    .eq('school_id', schoolId).eq('grade', grade).eq('section', section);
  return (data || []).length > 0;
}

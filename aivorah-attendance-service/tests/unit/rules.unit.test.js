const rules = require('../../services/rules');

const grades = [
  { name: 'Grade 5', sections: [{ name: 'E2E-ATT', classTeacherEmail: 'Att@School.org', studentCount: 3 }, { name: 'B', classTeacherEmail: null }] },
  { name: 'Grade 6', sections: [{ name: 'A', classTeacherEmail: 'att@school.org', archived: true }] },
  { name: 'Old', archived: true, sections: [{ name: 'A', classTeacherEmail: 'att@school.org' }] },
];
const teacher = { role: 'teacher', school_id: 's1', email: 'att@school.org', name: 'Ms Att' };
const other = { role: 'teacher', school_id: 's1', email: 'other@school.org' };
const admin = { role: 'school_admin', school_id: 's1', email: 'admin@school.org' };

describe('who may manage a class', () => {
  test('class teacher, email case-insensitive', () => expect(rules.canManageClass(teacher, grades, 'Grade 5', 'E2E-ATT')).toBe(true));
  test('class teacher of another class: no', () => expect(rules.canManageClass(teacher, grades, 'Grade 5', 'B')).toBe(false));
  test('other teacher: no', () => expect(rules.canManageClass(other, grades, 'Grade 5', 'E2E-ATT')).toBe(false));
  test('school admin: any existing class', () => {
    expect(rules.canManageClass(admin, grades, 'Grade 5', 'B')).toBe(true);
    expect(rules.canManageClass(admin, grades, 'Grade 9', 'Z')).toBe(false);
  });
  test('no school, student or parent: no', () => {
    expect(rules.canManageClass({ ...teacher, school_id: null }, grades, 'Grade 5', 'E2E-ATT')).toBe(false);
    expect(rules.canManageClass({ role: 'student', school_id: 's1' }, grades, 'Grade 5', 'E2E-ATT')).toBe(false);
    expect(rules.canManageClass({ role: 'parent', school_id: 's1', email: 'att@school.org' }, grades, 'Grade 5', 'E2E-ATT')).toBe(false);
  });
});

describe('teacherClasses', () => {
  test('only own, non-archived sections', () => {
    expect(rules.teacherClasses(teacher, grades)).toEqual([{
      grade: 'Grade 5', section: 'E2E-ATT', label: 'Grade 5 E2E-ATT', classTeacherEmail: 'Att@School.org', classTeacherName: 'Ms Att', studentCount: 3,
    }]);
  });
  test('a teacher with no class gets an empty list', () => expect(rules.teacherClasses(other, grades)).toEqual([]));
  test('non-teachers get nothing', () => expect(rules.teacherClasses(admin, grades)).toEqual([]));
});

describe('isValidDate', () => {
  test.each([['2026-09-02', true], ['2026-02-30', false], ['2026-9-2', false], ['', false], [undefined, false], ['2026-13-01', false]])(
    '%s -> %s', (d, ok) => expect(rules.isValidDate(d)).toBe(ok),
  );
});

describe('validateRecords', () => {
  const roster = ['a', 'b'];
  test('valid map', () => expect(rules.validateRecords({ a: 'present', b: 'late' }, roster)).toBeNull());
  test('not an object', () => expect(rules.validateRecords(['a'], roster)).toMatch(/object/));
  test('empty', () => expect(rules.validateRecords({}, roster)).toMatch(/empty/));
  test('bad status', () => expect(rules.validateRecords({ a: 'here' }, roster)).toMatch(/invalid status/));
  test('student outside the class', () => expect(rules.validateRecords({ z: 'present' }, roster)).toMatch(/not in this class/));
});

describe('summarize', () => {
  test('monolith formula: late counts as half', () => {
    const { summary } = rules.summarize([{ date: '2026-09-01', status: 'present' }, { date: '2026-09-02', status: 'absent' }, { date: '2026-09-03', status: 'late' }]);
    expect(summary).toEqual({ present: 1, absent: 1, late: 1, total: 3, ratePct: 50 });
  });
  test('no records: rate is null, not 100', () => expect(rules.summarize([]).summary).toEqual({ present: 0, absent: 0, late: 0, total: 0, ratePct: null }));
  test('history newest first, at most 30, only date + status', () => {
    const rows = Array.from({ length: 35 }, (_, i) => ({ date: `2026-08-${String(i + 1).padStart(2, '0')}`.replace('2026-08-32', '2026-09-01').replace('2026-08-33', '2026-09-02').replace('2026-08-34', '2026-09-03').replace('2026-08-35', '2026-09-04'), status: 'present', extra: 1 }));
    const { history } = rules.summarize(rows);
    expect(history).toHaveLength(30);
    expect(history[0]).toEqual({ date: '2026-09-04', status: 'present' });
    expect(history[1].date).toBe('2026-09-03');
  });
});

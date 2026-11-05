const { parseAttendanceJson, attachClass } = require('../../scripts/import-attendance-json.cjs');

describe('parseAttendanceJson', () => {
  test('flattens date -> student -> status into rows', () => {
    const { rows, skipped } = parseAttendanceJson({ '2026-09-01': { s1: 'present', s2: 'late' }, '2026-09-02': { s1: 'absent' } });
    expect(rows).toEqual([
      { student_id: 's1', date: '2026-09-01', status: 'present' },
      { student_id: 's2', date: '2026-09-01', status: 'late' },
      { student_id: 's1', date: '2026-09-02', status: 'absent' },
    ]);
    expect(skipped).toEqual([]);
  });

  test('skips bad dates and bad statuses, keeps the rest', () => {
    const { rows, skipped } = parseAttendanceJson({ 'not-a-date': { s1: 'present' }, '2026-09-03': { s1: 'here', s2: 'present' } });
    expect(rows).toEqual([{ student_id: 's2', date: '2026-09-03', status: 'present' }]);
    expect(skipped.map((s) => s.reason)).toEqual(['bad date', 'bad status here']);
  });

  test('an empty or non-object file gives nothing', () => {
    expect(parseAttendanceJson({}).rows).toEqual([]);
    expect(parseAttendanceJson([]).skipped[0].reason).toMatch(/not an object/);
  });
});

describe('attachClass', () => {
  test('adds school/grade/section and drops unknown students', () => {
    const users = new Map([['s1', { id: 's1', school_id: 'sch', grade: 'Grade 5', section: 'A' }]]);
    const { rows, unknown } = attachClass([{ student_id: 's1', date: '2026-09-01', status: 'present' }, { student_id: 'gone', date: '2026-09-01', status: 'absent' }], users);
    expect(rows).toEqual([{ student_id: 's1', date: '2026-09-01', status: 'present', school_id: 'sch', grade: 'Grade 5', section: 'A', marked_by_email: 'import:monolith-attendance.json' }]);
    expect(unknown).toEqual(['gone']);
  });
});

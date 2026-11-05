// buildGradesSectionsView: the overlay's classTeacherEmail is kept, student grade/sections are folded in.
let mockSchool;
let mockStudents;
jest.mock('../../services/supabase', () => ({
  from: (table) => {
    const chain = {
      select: () => chain, eq: () => chain, neq: () => chain,
      maybeSingle: async () => ({ data: mockSchool }),
      then: (resolve) => resolve({ data: table === 'users' ? mockStudents : [] }),
    };
    return chain;
  },
}));
const { buildGradesSectionsView } = require('../../services/academicStructure');

test('overlay sections keep their class teacher; student-only sections are added with none', async () => {
  mockSchool = { academic_structure: { grades: [{ name: 'Grade 5', sections: [{ name: 'E2E-ATT', classTeacherEmail: 'att@school.org' }] }] } };
  mockStudents = [{ grade: 'Grade 5', section: 'E2E-ATT' }, { grade: 'Grade 5', section: 'E2E-ATT' }, { grade: 'Grade 5', section: 'B' }, { grade: 'Grade 10', section: '' }];
  const grades = await buildGradesSectionsView('s1');
  expect(grades.map((g) => g.name)).toEqual(['Grade 5', 'Grade 10']);
  expect(grades[0].sections).toEqual([
    { name: 'B', archived: false, studentCount: 1, classTeacherEmail: null },
    { name: 'E2E-ATT', archived: false, studentCount: 2, classTeacherEmail: 'att@school.org' },
  ]);
  expect(grades[1].unassignedCount).toBe(1);
});

test('a school with no academic_structure still lists student classes', async () => {
  mockSchool = null;
  mockStudents = [{ grade: 'Grade 5', section: 'A' }];
  const grades = await buildGradesSectionsView('s1');
  expect(grades[0].sections[0]).toMatchObject({ name: 'A', classTeacherEmail: null });
});

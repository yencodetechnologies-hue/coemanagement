// Sample data used on first run and by "Reset sample data".
module.exports = () => ({
  key: 'main',
  university: {
    name: 'Bharath Institute of Higher Education and Research',
    shortName: 'BIHER',
    recognition: 'Declared as Deemed-to-be University under Section 3 of UGC Act 1956',
    address: '# 173, Agharam Road, Selaiyur, Chennai - 600 073, Tamil Nadu, India',
    signatoryTitle: 'Controller of Examinations',
  },
  gradingScale: [
    { grade: 'O', description: 'Outstanding', minPercent: 85, gradePoint: 10 },
    { grade: 'A+', description: 'Excellent', minPercent: 80, gradePoint: 9 },
    { grade: 'A', description: 'Very good', minPercent: 75, gradePoint: 8 },
    { grade: 'B+', description: 'Good', minPercent: 65, gradePoint: 7 },
    { grade: 'B', description: 'Above average', minPercent: 60, gradePoint: 6 },
    { grade: 'C', description: 'Average', minPercent: 50, gradePoint: 5 },
    { grade: 'P', description: 'Pass', minPercent: 40, gradePoint: 4 },
    { grade: 'F', description: 'Fail', minPercent: 0, gradePoint: 0 },
  ],
  sessions: [
    { name: 'MAR-2025', active: false }, { name: 'SEP-2025', active: false },
    { name: 'MAR-2026', active: false }, { name: 'SEP-2026', active: true },
    { name: 'MAR-2027', active: false },
  ],
  nextGradeStatementSerial: 1787,
});
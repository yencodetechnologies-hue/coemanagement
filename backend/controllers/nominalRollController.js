const AttendanceEntry = require('../models/Attendanceentry');
const Student = require('../models/Student');
const Course = require('../models/Course');
const Curriculum = require('../models/Curriculum');
const Institution = require('../models/Institution');

const FILTER_FIELDS = ['instCode', 'course', 'batch', 'semester', 'examYear', 'studentCategory'];

// matches "3", "03", "III", "Semester 3", "semester III" (same rule as the attendance marks page)
const ROMANS = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
function semesterMatch(sem) {
  const raw = String(sem ?? '').trim().replace(/^semester\s*/i, '');
  const n = /^\d+$/.test(raw) ? Number(raw) : ROMANS.indexOf(raw.toUpperCase());
  if (!n || n < 1 || n >= ROMANS.length) return sem; // fall back to the exact value
  return { $regex: new RegExp(`^\\s*(semester\\s*)?0*(${n}|${ROMANS[n]})\\s*$`, 'i') };
}

// "equal", ignoring upper / lower case and spaces at the ends (same rule as the attendance sheet)
const escapeRe = (v) => String(v).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const same = (v) => new RegExp(`^\\s*${escapeRe(String(v ?? '').trim())}\\s*$`, 'i');

const natural = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true });
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const round1 = (v) => Math.round(v * 10) / 10;

// GET /api/nominal-roll/filters
exports.getFilterOptions = async (req, res) => {
  try {
    const entries = await Promise.all(
      FILTER_FIELDS.map(async (f) => [f, (await AttendanceEntry.distinct(f)).sort()])
    );
    res.json({ success: true, data: Object.fromEntries(entries) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * GET /api/nominal-roll?instCode=&course=&batch=&semester=&examYear=&studentCategory=
 *
 * The attendance percentage of a student is calculated from the Attendance & internal marks page:
 *
 *   - Theory and Practical attendance are entered separately. The attendance % of a SUBJECT is
 *     the average of its theory and practical attendance (stored on the entry as `attendance`)
 *   - ONLY the subjects of this semester's curriculum are counted. An attendance entry saved
 *     under a subject code that is not in the semester (an old or wrong code, an inactive
 *     subject) is ignored, because it cannot be seen or corrected on the attendance page and
 *     would pull the average down. The ignored codes are returned in info.ignoredSubjects.
 *   - Avg attendance = (sum of the attendance % of the subjects entered) / (number of subjects entered)
 *   - a subject whose attendance is not entered yet is NOT counted as 0; it is left out and the
 *     row shows how many subjects are entered ("5 of 8 subjects")
 *   - Eligibility: Pending until at least one subject is entered, then
 *     Eligible when the rounded average >= the course minimum (same rule as the hall ticket)
 *
 * The roll lists every ACTIVE student of the batch and category from the Student master, so a
 * student with no attendance entered yet still appears (as Pending).
 */
exports.getNominalRoll = async (req, res) => {
  try {
    const match = {};
    for (const f of FILTER_FIELDS) {
      if (!req.query[f]) {
        return res.status(400).json({ success: false, message: `${f} is required` });
      }
      match[f] = String(req.query[f]);
    }

    const [institution, course] = await Promise.all([
      Institution.findOne({ instCode: match.instCode.toUpperCase() }).lean(),
      // AttendanceEntry.course may hold the course code or the course name
      Course.findOne({
        instCode: match.instCode,
        $or: [{ courseCode: match.course }, { courseName: match.course }],
      }).lean(),
    ]);
    const minAttendance = course?.attendancePercentage ?? 75;
    const courseKeys = [...new Set([match.course, course?.courseCode, course?.courseName].filter(Boolean))];

    const [entries, masterStudents, curriculum] = await Promise.all([
      AttendanceEntry.find(match).select('regNo subCode attendance theoryAttendance practicalAttendance').lean(),
      // Student master: code = inst code, mode = student category (as on the attendance marks page)
      Student.find({
        code: same(match.instCode),
        course: { $in: courseKeys.map(same) },
        batch: same(match.batch),
        mode: same(match.studentCategory),
        status: 'Active',
      }).lean(),
      Curriculum.find({
        instCode: match.instCode,
        course: { $in: courseKeys },
        semester: semesterMatch(match.semester),
        status: { $ne: 'Inactive' },
      })
        .select('subCodeP1')
        .lean(),
    ]);

    // subjects of the semester (a Theory and a Practical record of one code are one subject here,
    // because they share one attendance %)
    const curriculumCodes = new Set(curriculum.map((c) => c.subCodeP1).filter(Boolean));
    const entryCodes = new Set(entries.map((e) => e.subCode));
    // when the curriculum of the semester is known, only its subjects count;
    // without a curriculum (nothing to compare with) every entered code counts
    const subjectCodes = curriculumCodes.size ? curriculumCodes : entryCodes;
    const subjectList = [...subjectCodes].sort(natural);
    const subjectsTotal = subjectList.length;
    const ignoredSubjects = [...entryCodes].filter((code) => !subjectCodes.has(code)).sort(natural);

    // attendance % of every student, per subject of the semester
    const byReg = new Map(); // regNo -> Map(subCode -> attendance)
    const partsOf = new Map(); // regNo|subCode -> { theory, practical } when they were entered separately
    entries.forEach((e) => {
      if (!byReg.has(e.regNo)) byReg.set(e.regNo, new Map());
      if (!subjectCodes.has(e.subCode)) return;
      // the subject's attendance; for safety it is worked out here when only the two parts are stored
      const parts = [e.theoryAttendance, e.practicalAttendance].filter(isNum);
      const value = isNum(e.attendance)
        ? e.attendance
        : parts.length ? parts.reduce((a, b) => a + b, 0) / parts.length : null;
      if (value !== null) byReg.get(e.regNo).set(e.subCode, value);
      if (parts.length) {
        partsOf.set(`${e.regNo}|${e.subCode}`, {
          theory: isNum(e.theoryAttendance) ? e.theoryAttendance : null,
          practical: isNum(e.practicalAttendance) ? e.practicalAttendance : null,
        });
      }
    });

    // students: the master list, plus anyone who has entries but is missing from the master
    const master = new Map(masterStudents.map((s) => [s.registerNo, s]));
    const extraRegNos = [...byReg.keys()].filter((r) => !master.has(r));
    if (extraRegNos.length) {
      const extra = await Student.find({ registerNo: { $in: extraRegNos } }).lean();
      extra.forEach((s) => master.set(s.registerNo, s));
    }
    const regNos = [...new Set([...master.keys(), ...byReg.keys()])].sort(natural);

    const roll = regNos.map((regNo, i) => {
      const s = master.get(regNo) || {};
      const own = byReg.get(regNo) || new Map();
      const values = [...own.values()];
      const entered = values.length;
      const exact = entered ? values.reduce((a, b) => a + b, 0) / entered : null;
      const avg = exact === null ? null : Math.round(exact); // the figure eligibility is decided on
      return {
        sno: i + 1,
        regNo,
        name: s.studentName || '—',
        gender: s.gender || '—',
        dob: s.dob || '',
        avgAttendance: avg,
        avgAttendanceExact: exact === null ? null : round1(exact),
        subjectsEntered: entered,
        subjectsTotal,
        // what the average is made of: every subject of the semester with its attendance % (null = not entered)
        subjects: subjectList.map((subCode) => ({
          subCode,
          attendance: own.has(subCode) ? own.get(subCode) : null,
          ...(partsOf.get(`${regNo}|${subCode}`) || {}), // theory / practical, when entered separately
        })),
        eligibility:
          avg === null ? 'Pending' : avg >= minAttendance ? 'Eligible' : 'Not eligible',
      };
    });

    res.json({
      success: true,
      data: {
        info: {
          // from the Institution record
          instCode: match.instCode,
          instName: institution?.instName || match.instCode,
          discipline: institution?.discipline || '',
          headDesignation: institution?.headDesignation || '',
          city: institution?.city || '',
          phone: institution?.phone || '',
          email: institution?.email || '',
          // from the Course record
          courseName: match.course,
          degree: course?.degree || '',
          courseMode: course?.mode || '',
          department: course?.department || '',
          regulation: course?.regulation || '',
          examPattern: course?.examPattern || '',
          minAttendance,
          subjectsTotal,
          // subject codes that have attendance entries but are not in this semester's curriculum (not counted)
          ignoredSubjects,
          // summary of the roll
          eligible: roll.filter((r) => r.eligibility === 'Eligible').length,
          notEligible: roll.filter((r) => r.eligibility === 'Not eligible').length,
          pending: roll.filter((r) => r.eligibility === 'Pending').length,
        },
        roll,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
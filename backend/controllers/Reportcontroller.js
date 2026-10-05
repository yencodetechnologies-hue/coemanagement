const AttendanceEntry = require('../models/Attendanceentry');
const Student = require('../models/Student');
const Curriculum = require('../models/Curriculum');
const ExamApplicationSetting = require('../models/ExamApplicationSetting');
// grades come from the same engine as the Result processing page
const { loadResult, courseContext, semesterVariants } = require('./Resultcontroller');

const ok = (res, data, code = 200) => res.status(code).json({ success: true, data });
const fail = (res, code, message) => res.status(code).json({ success: false, message });
const serverError = (res, err) => fail(res, 500, err.message || 'Server error');

const natural = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true });
const REGULAR_RE = /^regular$/i;

const KEYS = ['instCode', 'course', 'batch', 'semester', 'examYear'];
const pickFilter = (src) => {
  const f = {};
  KEYS.forEach((k) => {
    f[k] = String(src?.[k] ?? '').trim();
  });
  return f;
};
const missingKeys = (f) => KEYS.filter((k) => !f[k]);

const subjectLabel = (s) =>
  `${s.code}${s.code2 ? `-${s.code2}` : ''}${s.shared ? (s.type === 'PRACTICAL' ? ' (Practical)' : ' (Theory)') : ''}`;

const avgOf = (list) => {
  const v = list.filter((e) => e.attendance !== null && e.attendance !== undefined).map((e) => e.attendance);
  return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null;
};

/* ---------- 1 + 2: pass percentage per subject, grade distribution ---------- */
const resultReports = (result) => {
  const passBySubject = result.subjects.map((s, i) => {
    let appeared = 0;
    let passed = 0;
    result.rows.forEach((r) => {
      const g = r.grades[i];
      if (!g || g.state !== 'DONE') return; // not registered, or mark still pending
      appeared += 1;
      if (g.pass) passed += 1;
    });
    return {
      label: subjectLabel(s),
      name: [s.name, s.name2].filter(Boolean).join(' & '),
      appeared,
      passed,
      percent: appeared ? Math.round((passed / appeared) * 100) : null,
    };
  });

  // every graded subject of every candidate, counted by grade
  const counts = new Map();
  result.rows.forEach((r) =>
    r.grades.forEach((g) => {
      if (!g || g.state !== 'DONE') return;
      const grade = g.absent ? 'Ab' : g.grade;
      counts.set(grade, (counts.get(grade) || 0) + 1);
    })
  );
  const order = [...(result.gradingScale || []).map((g) => g.grade)];
  [...counts.keys()].forEach((g) => {
    if (g !== 'Ab' && !order.includes(g)) order.push(g); // e.g. "Pass" for non-letter-grade subjects
  });
  order.push('Ab');
  const gradeDistribution = order.map((grade) => ({ grade, count: counts.get(grade) || 0 }));

  return { passBySubject, gradeDistribution };
};

/* ---------- 3: attendance shortage ---------- */
const attendanceReport = async (entries, minAttendance) => {
  const seen = new Set();
  const low = [];
  entries.forEach((e) => {
    if (e.attendance === null || e.attendance === undefined || e.attendance >= minAttendance) return;
    const key = `${e.regNo}|${e.subCode}`;
    if (seen.has(key)) return;
    seen.add(key);
    low.push({ regNo: e.regNo, subject: e.subCode, attendance: e.attendance });
  });
  const students = await Student.find({ registerNo: { $in: [...new Set(low.map((r) => r.regNo))] } })
    .select('registerNo studentName')
    .lean();
  const nameOf = Object.fromEntries(students.map((s) => [s.registerNo, s.studentName]));
  return low
    .map((r) => ({ ...r, name: nameOf[r.regNo] || '—' }))
    .sort((a, b) => natural(a.regNo, b.regNo) || natural(a.subject, b.subject));
};

/* ---------- 4: exam fee ----------
 * Same rules as the "Application & hall ticket" page (keep them in step if you change that page):
 *   REGULAR  attendance average >= minimum; a paper counts when internal mark >= internal minimum
 *   ARREAR   the student's REGULAR papers with internal mark below the minimum (attendance fine),
 *            plus papers from explicit ARREAR attendance entries
 *   fee of one application = exam amount of its papers + the extra costs saved on that page
 *   (application, mark sheet, provisional 1 and 2, convocation, and the penalty when it is ticked)
 */
const feeReport = (entries, curriculumRows, settings, f, course, minAttendance) => {
  // one curriculum row per subject code (best match), looked up by code 1 and code 2
  const score = (c) =>
    (c.batch === f.batch ? 8 : !c.batch ? 4 : 0) +
    (course?.regulation && c.regulation === course.regulation ? 2 : 0) +
    (c.status === 'Active' ? 1 : 0);
  const bySub = new Map();
  curriculumRows.forEach((c) => {
    [c.subCodeP1, c.subCodeP2].filter(Boolean).forEach((code) => {
      const prev = bySub.get(code);
      if (!prev || score(c) > score(prev)) bySub.set(code, c);
    });
  });

  const group = (list) => {
    const m = new Map();
    list.forEach((e) => {
      if (!m.has(e.regNo)) m.set(e.regNo, []);
      m.get(e.regNo).push(e);
    });
    return m;
  };
  const regularByReg = group(entries.filter((e) => REGULAR_RE.test(e.studentCategory)));
  const categories = [...new Set(entries.map((e) => e.studentCategory))];

  const extrasOf = (category) => {
    const s = settings.find((x) => x.studentCategory === category);
    if (!s) return 0;
    return (
      (s.applicationCost || 0) + (s.markSheetCost || 0) + (s.provisional1Cost || 0) +
      (s.provisional2Cost || 0) + (s.convocationCost || 0) + (s.applyPenalty ? s.penalty || 0 : 0)
    );
  };

  let applications = 0;
  let feesAssessed = 0;

  categories.forEach((category) => {
    const isArrear = /arrear/i.test(category);
    const ownByReg = group(entries.filter((e) => e.studentCategory === category));
    const regNos = new Set([...ownByReg.keys(), ...(isArrear ? regularByReg.keys() : [])]);
    const extras = extrasOf(category);

    regNos.forEach((regNo) => {
      const papers = new Map(); // curriculum id -> exam amount
      const add = (c) => papers.set(String(c._id), Number(c.examAmount) || 0);

      if (!isArrear) {
        const list = ownByReg.get(regNo) || [];
        const avg = avgOf(list);
        if (avg !== null && avg >= minAttendance) {
          list.forEach((e) => {
            const c = bySub.get(e.subCode);
            if (c && e.internalMark !== null && e.internalMark !== undefined && e.internalMark >= c.internalMinMark) add(c);
          });
        }
      } else {
        const reg = regularByReg.get(regNo) || [];
        const regAvg = avgOf(reg);
        if (reg.length && regAvg !== null && regAvg >= minAttendance) {
          reg.forEach((e) => {
            const c = bySub.get(e.subCode);
            if (c && e.internalMark !== null && e.internalMark !== undefined && e.internalMark < c.internalMinMark) add(c);
          });
        }
        (ownByReg.get(regNo) || []).forEach((e) => {
          const c = bySub.get(e.subCode);
          if (c) add(c);
        });
      }

      if (!papers.size) return; // nothing to apply for
      applications += 1;
      feesAssessed += [...papers.values()].reduce((a, b) => a + b, 0) + extras;
    });
  });

  return { examYear: f.examYear, applications, feesAssessed };
};

/* ------------------------------ handler ------------------------------ */

// GET /api/reports?instCode=&course=&batch=&semester=&examYear=
exports.getReports = async (req, res) => {
  try {
    const f = pickFilter(req.query);
    if (missingKeys(f).length) return fail(res, 400, `Missing: ${missingKeys(f).join(', ')}`);

    const { doc: course, keys: courseKeys } = await courseContext(f.instCode, f.course);
    const semIn = { $in: semesterVariants(f.semester) };
    const scope = { instCode: f.instCode, course: { $in: courseKeys }, batch: f.batch, semester: semIn, examYear: f.examYear };
    const minAttendance = course?.attendancePercentage ?? 75;

    const [result, entries, curriculumRows, settings] = await Promise.all([
      loadResult(f),
      AttendanceEntry.find(scope).lean(),
      Curriculum.find({ instCode: f.instCode, course: { $in: courseKeys }, semester: semIn }).lean(),
      ExamApplicationSetting.find(scope).lean(),
    ]);

    const fromResult = result.error
      ? { passBySubject: [], gradeDistribution: [] }
      : resultReports(result);

    ok(res, {
      resultStatus: result.error ? null : result.status, // PUBLISHED or DRAFT (live preview)
      resultMessage: result.error ? result.error[1] : '',
      ...fromResult,
      attendance: {
        minimum: minAttendance,
        rows: await attendanceReport(entries, minAttendance),
      },
      fee: feeReport(entries, curriculumRows, settings, f, course, minAttendance),
    });
  } catch (err) {
    serverError(res, err);
  }
};
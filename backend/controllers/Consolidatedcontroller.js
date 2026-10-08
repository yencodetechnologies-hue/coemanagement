const mongoose = require('mongoose');
const AttendanceEntry = require('../models/Attendanceentry');
const Student = require('../models/Student');
const Course = require('../models/Course');
const Curriculum = require('../models/Curriculum');
const Institution = require('../models/Institution');
const ResultSheet = require('../models/Resultsheet');
const ConsolidatedStatement = require('../models/Consolidatedstatement');

// Reuse the Settings model your app already registered (requiring the file again with a
// different path spelling compiles it twice on Windows -> OverwriteModelError).
const Settings = () => mongoose.models.Settings || require('../models/Settings');

const ok = (res, data, code = 200) => res.status(code).json({ success: true, data });
const fail = (res, code, message) => res.status(code).json({ success: false, message });
const serverError = (res, err) => fail(res, 500, err.message || 'Server error');

/* ------------------------------ helpers ------------------------------ */

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

// "Semester II" / "II" / "2" / "SEMESTER 2"  ->  number
const semesterNumber = (sem) => {
  const s = String(sem || '').trim();
  const digits = s.match(/\d+/);
  if (digits) return parseInt(digits[0], 10);
  const idx = ROMAN.indexOf(s.replace(/semester/i, '').trim().toUpperCase());
  return idx >= 0 ? idx + 1 : null;
};

// "MAR-2025" / "Sep 2026" -> a number that sorts by date (0 when it cannot be read)
const examOrder = (examYear) => {
  const m = /([A-Za-z]{3})[A-Za-z]*[\s\-/]*(\d{4})/.exec(String(examYear || ''));
  if (!m) return 0;
  const month = MONTHS.indexOf(m[1].toUpperCase());
  return Number(m[2]) * 12 + (month < 0 ? 0 : month);
};

// attendance / result sheets may store the course as code OR name
const courseContext = async (instCode, course) => {
  const doc = await Course.findOne({
    instCode,
    $or: [{ courseCode: course }, { courseName: course }],
  }).lean();
  const keys = [...new Set([course, doc?.courseCode, doc?.courseName].filter(Boolean))];
  return { doc, keys };
};

const natural = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true });
const round2 = (v) => Math.round(v * 100) / 100;

const KEYS = ['instCode', 'course', 'batch', 'regNo'];
const pickFilter = (src) => {
  const f = {};
  KEYS.forEach((k) => {
    f[k] = String(src?.[k] ?? '').trim();
  });
  return f;
};
const missingKeys = (f) => KEYS.filter((k) => !f[k]);

/**
 * Consolidated statement of ONE candidate, built from PUBLISHED results only
 * (Result processing -> Publish results).
 *
 * A semester can have more than one published result (the regular exam and later reappear
 * exams). For every subject the statement keeps ONE result:
 *   - a pass is never replaced by a later fail
 *   - between two passes, the higher grade point is kept
 *   - a fail (RA / absent) is replaced by the next attempt
 *
 * GPA of a semester and the CGPA = sum(credit x grade point) / sum(credits),
 * counting only subjects marked "Added to SGPA".
 */
async function buildStatement(f) {
  const { doc: course, keys: courseKeys } = await courseContext(f.instCode, f.course);

  const [inst, settings, sheets, student, curriculumSemesters, issued] = await Promise.all([
    Institution.findOne({ instCode: f.instCode.toUpperCase() }).lean(),
    Settings().findOne({ key: 'main' }).select('university').lean(),
    ResultSheet.find({
      instCode: f.instCode,
      course: { $in: courseKeys },
      batch: f.batch,
      status: 'PUBLISHED',
      'rows.regNo': f.regNo,
    })
      // only this candidate's row of each sheet
      .select({ semester: 1, examYear: 1, subjects: 1, publishedOn: 1, rows: { $elemMatch: { regNo: f.regNo } } })
      .lean(),
    Student.findOne({ registerNo: f.regNo }).select('registerNo studentName dob').lean(),
    Curriculum.distinct('semester', { instCode: f.instCode, course: { $in: courseKeys } }),
    ConsolidatedStatement.findOne({ instCode: f.instCode, course: f.course, batch: f.batch, regNo: f.regNo }).lean(),
  ]);

  // ---- merge the attempts of every semester, oldest exam first ----
  const ordered = [...sheets].sort((a, b) => examOrder(a.examYear) - examOrder(b.examYear));
  const byTerm = new Map(); // term number -> Map(subject key -> result)
  let rowName = '';

  ordered.forEach((sheet) => {
    const row = sheet.rows?.[0];
    if (!row) return;
    rowName = row.name || rowName;
    const term = semesterNumber(sheet.semester) || 0;
    if (!byTerm.has(term)) byTerm.set(term, new Map());
    const subjects = byTerm.get(term);

    (sheet.subjects || []).forEach((s, i) => {
      const g = row.grades?.[i];
      if (!g || g.state !== 'DONE') return;
      const key = s.key || `${s.code}|${s.type || 'THEORY'}`;
      const cur = {
        key,
        code: s.code,
        code2: s.code2 || '',
        name: s.name || '',
        name2: s.name2 || '',
        type: s.type || 'THEORY',
        shared: !!s.shared,
        college: !!s.college,
        credit: Number(s.credit) || 0,
        addedToSgpa: s.addedToSgpa !== false,
        grade: g.absent ? 'Ab' : g.grade,
        gradePoint: Number(g.gradePoint) || 0,
        pass: !!g.pass,
        absent: !!g.absent,
        examYear: sheet.examYear,
      };
      const prev = subjects.get(key);
      const keepPrev =
        prev && prev.pass && (!cur.pass || cur.gradePoint <= prev.gradePoint);
      if (!keepPrev) subjects.set(key, cur);
    });
  });

  // ---- semesters ----
  let cgpaPoints = 0;
  let cgpaCredits = 0;
  let creditsRegistered = 0;
  let creditsEarned = 0;
  let lastExam = '';

  const semesters = [...byTerm.keys()]
    .sort((a, b) => a - b)
    .map((term) => {
      const subjects = [...byTerm.get(term).values()].sort(
        (a, b) => natural(a.code, b.code) || (a.type === b.type ? 0 : a.type === 'THEORY' ? -1 : 1)
      );
      let points = 0;
      let gpaCredits = 0;
      let registered = 0;
      let earned = 0;
      let latest = '';
      subjects.forEach((s) => {
        registered += s.credit;
        if (s.pass) earned += s.credit;
        if (s.addedToSgpa) {
          points += s.credit * s.gradePoint;
          gpaCredits += s.credit;
        }
        if (examOrder(s.examYear) >= examOrder(latest)) latest = s.examYear;
      });
      cgpaPoints += points;
      cgpaCredits += gpaCredits;
      creditsRegistered += registered;
      creditsEarned += earned;
      if (examOrder(latest) >= examOrder(lastExam)) lastExam = latest;

      return {
        term,
        label: term ? `Semester ${ROMAN[term - 1] || term}` : 'Semester',
        examYear: latest,
        subjects,
        creditsRegistered: registered,
        creditsEarned: earned,
        gpaPoints: round2(points),
        gpaCredits,
        gpa: gpaCredits ? round2(points / gpaCredits) : null,
        result: subjects.some((s) => !s.pass) ? 'RA' : 'Pass',
      };
    })
    .filter((s) => s.subjects.length);

  // total semesters of the course:
  //   1. the number stored on the Course, if it has one
  //      (ADAPT: put your Course field name here if it is not one of these)
  //   2. otherwise the highest semester found in the curriculum
  const declared =
    Number(
      course?.terms || course?.noOfTerms || course?.totalTerms ||
      course?.noOfSemesters || course?.totalSemesters || course?.semesters
    ) || 0;
  const totalSemesters =
    declared ||
    Math.max(
      0,
      ...curriculumSemesters.map((s) => semesterNumber(s) || 0),
      ...semesters.map((s) => s.term)
    );

  // which published results this statement was built from
  const fingerprint = sheets
    .map((s) => `${s._id}:${s.publishedOn ? new Date(s.publishedOn).getTime() : 0}`)
    .sort()
    .join('|');

  return {
    fingerprint,
    data: {
      university: settings?.university || {},
      info: {
        instName: inst?.instName || f.instCode,
        courseName: course?.courseName || f.course,
        courseCode: course?.courseCode || f.course,
        department: course?.department || '',
        regulation: course?.regulation || '',
        batch: f.batch,
      },
      candidate: {
        regNo: f.regNo,
        name: student?.studentName || rowName || '—',
        dob: student?.dob || '',
      },
      semesters,
      summary: {
        cgpa: cgpaCredits ? round2(cgpaPoints / cgpaCredits) : null,
        cgpaPoints: round2(cgpaPoints),
        cgpaCredits,
        creditsEarned,
        creditsRegistered,
        semestersComplete: semesters.length,
        totalSemesters,
        arrears: semesters.filter((s) => s.result === 'RA').length,
        lastExamYear: lastExam,
      },
      // the serial already issued, and whether it still matches the published results
      serial: issued
        ? { serialNo: issued.serialNo, issuedOn: issued.issuedOn, current: issued.fingerprint === fingerprint }
        : null,
    },
  };
}

// used by the provisional certificate controller as well
exports.buildStatement = buildStatement;
exports.courseContext = courseContext;
exports.semesterNumber = semesterNumber;

/* ------------------------------ handlers ------------------------------ */

// GET /api/consolidated/options?instCode=&course=&batch=
// Dropdown lists; candidates are returned once a batch is chosen.
exports.getOptions = async (req, res) => {
  try {
    const { instCode, course, batch } = req.query;
    const out = { instCodes: [], courses: [], batches: [], candidates: [] };

    out.instCodes = (await Course.distinct('instCode')).filter(Boolean).sort(natural);

    if (instCode) {
      out.courses = await Course.find({ instCode }).select('courseCode courseName').sort({ courseCode: 1 }).lean();
    }

    if (instCode && course) {
      const { keys } = await courseContext(instCode, course);
      const base = { instCode, course: { $in: keys } };

      out.batches = (await AttendanceEntry.distinct('batch', base))
        .filter((b) => b !== null && b !== undefined && b !== '')
        .map(String).sort(natural).reverse();

      if (batch) {
        const regNos = (await AttendanceEntry.distinct('regNo', { ...base, batch })).sort(natural);
        const students = await Student.find({ registerNo: { $in: regNos } }).select('registerNo studentName').lean();
        const nameOf = Object.fromEntries(students.map((s) => [s.registerNo, s.studentName]));
        out.candidates = regNos.map((regNo) => ({ regNo, name: nameOf[regNo] || '' }));
      }
    }

    ok(res, out);
  } catch (err) {
    serverError(res, err);
  }
};

// GET /api/consolidated/statement?instCode=&course=&batch=&regNo=
exports.getStatement = async (req, res) => {
  try {
    const f = pickFilter(req.query);
    if (missingKeys(f).length) return fail(res, 400, `Missing: ${missingKeys(f).join(', ')}`);

    const { data } = await buildStatement(f);
    ok(res, data);
  } catch (err) {
    serverError(res, err);
  }
};

// POST /api/consolidated/issue   body: { instCode, course, batch, regNo }
// Gives the statement its serial number from Settings.nextGradeStatementSerial.
//   - nothing changed since the last issue -> the SAME serial is returned (a reprint)
//   - first issue, or new results published since -> the NEXT serial is taken and the
//     counter in Settings moves forward by one
exports.issue = async (req, res) => {
  try {
    const f = pickFilter(req.body);
    if (missingKeys(f).length) return fail(res, 400, `Missing: ${missingKeys(f).join(', ')}`);

    const { data, fingerprint } = await buildStatement(f);
    if (!data.semesters.length) {
      return fail(res, 400, 'No published results for this candidate. Publish the results first.');
    }

    const key = { instCode: f.instCode, course: f.course, batch: f.batch, regNo: f.regNo };
    const existing = await ConsolidatedStatement.findOne(key).lean();

    if (existing && existing.fingerprint === fingerprint) {
      return ok(res, {
        ...data,
        serial: { serialNo: existing.serialNo, issuedOn: existing.issuedOn, current: true },
        reused: true,
      });
    }

    // take the next serial number and move the counter (one atomic step)
    const before = await Settings().findOneAndUpdate(
      { key: 'main' },
      { $inc: { nextGradeStatementSerial: 1 } },
      { new: false }
    ).lean();
    if (!before) return fail(res, 400, 'Settings are not saved yet. Save the Settings page first.');
    const serialNo = before.nextGradeStatementSerial || 1;

    const issuedOn = new Date();
    const issuedBy = String(req.admin?._id || '');
    const update = { $set: { serialNo, issuedOn, issuedBy, fingerprint } };
    if (existing) {
      update.$push = {
        history: { serialNo: existing.serialNo, issuedOn: existing.issuedOn, issuedBy: existing.issuedBy },
      };
    }
    await ConsolidatedStatement.findOneAndUpdate(key, update, { upsert: true, new: true, setDefaultsOnInsert: true });

    ok(res, { ...data, serial: { serialNo, issuedOn, current: true }, reused: false }, 201);
  } catch (err) {
    serverError(res, err);
  }
};
const AttendanceEntry = require('../models/Attendanceentry');
const Student = require('../models/Student');
const Course = require('../models/Course');
const Curriculum = require('../models/Curriculum');
const Institution = require('../models/Institution');
const mongoose = require('mongoose');

// The Settings model is already registered by your settings controller. Requiring its file
// again with a different path spelling (Windows treats "Settings.js" and "settings.js" as the
// same file, Node does not) compiles it twice -> OverwriteModelError. So reuse the registered
// model, and only load the file if nothing has registered it yet.
const Settings = () => mongoose.models.Settings || require('../models/Settings');
const BarcodeMapping = require('../models/Barcodemapping');
const Rebundle = require('../models/Rebundle');
const ResultSheet = require('../models/ResultSheet');

const ok = (res, data, code = 200) => res.status(code).json({ success: true, data });
const fail = (res, code, message) => res.status(code).json({ success: false, message });
const serverError = (res, err) => fail(res, 500, err.message || 'Server error');

/* ------------------------------ helpers ------------------------------ */

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

// "Semester II" / "II" / "2" / "SEMESTER 2"  ->  number
const semesterNumber = (sem) => {
  const s = String(sem || '').trim();
  const digits = s.match(/\d+/);
  if (digits) return parseInt(digits[0], 10);
  const idx = ROMAN.indexOf(s.replace(/semester/i, '').trim().toUpperCase());
  return idx >= 0 ? idx + 1 : null;
};

// every spelling that may be stored in the database
const semesterVariants = (sem) => {
  const s = String(sem || '').trim();
  const out = new Set([s]);
  const n = semesterNumber(s);
  if (n) {
    out.add(String(n));
    out.add(`Semester ${n}`);
    if (ROMAN[n - 1]) {
      out.add(ROMAN[n - 1]);
      out.add(`Semester ${ROMAN[n - 1]}`);
      out.add(`SEMESTER ${ROMAN[n - 1]}`);
    }
  }
  return [...out];
};

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// same spellings as semesterVariants, but matched case-insensitively and ignoring
// surrounding spaces ("semester 2", " Semester 2 " ...). Use with $in (accepts RegExp).
const semesterMatchers = (sem) =>
  semesterVariants(sem)
    .filter(Boolean)
    .map((v) => new RegExp(`^\\s*${escapeRegex(v)}\\s*$`, 'i'));

// attendance / curriculum / barcode mapping may store the course as code OR name
const courseContext = async (instCode, course) => {
  const doc = await Course.findOne({
    instCode,
    $or: [{ courseCode: course }, { courseName: course }],
  }).lean();
  const keys = [...new Set([course, doc?.courseCode, doc?.courseName].filter(Boolean))];
  return { doc, keys };
};

const natural = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true });
const isYes = (v) => /^y/i.test(String(v || ''));
const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
const round2 = (v) => Math.round(v * 100) / 100;

const KEYS = ['instCode', 'course', 'batch', 'semester', 'examYear'];
const pickFilter = (src) => {
  const f = {};
  KEYS.forEach((k) => {
    f[k] = String(src?.[k] ?? '').trim();
  });
  return f;
};
const missingKeys = (f) => KEYS.filter((k) => !f[k]);

/* ------------------------------ grading ------------------------------ */

/**
 * Grade of ONE subject for ONE student.
 *
 * state  PENDING  a mark is still missing. This includes a subject of the semester for which
 *                 nothing has been entered yet for the student: every candidate takes every
 *                 subject of the semester's curriculum, so a subject without an attendance entry
 *                 is "not entered yet", never "not registered". It is listed on the result sheet
 *                 and on the grade statement, and it blocks publishing until it is entered.
 *        DONE     graded
 *        (NA is no longer produced; the pages still understand it for results published earlier)
 *
 * Internal mark (from the Attendance & internal marks page): each sheet type keeps its own mark
 *   Theory paper    -> the Theory sheet's mark    (theoryInternalMark)
 *   Practical paper -> the Practical sheet's mark (practicalInternalMark)
 *   when that sheet has no mark, the Internal sheet's mark (internalMark) is used. Exception: the
 *   practical paper of a code that also has a theory paper never borrows it, because the Internal
 *   sheet of that code belongs to the theory paper (different maximum); it stays pending instead.
 *
 * Rules (ADAPT here if your regulations differ):
 *   - absent for the end-semester exam                      -> AB, fail
 *   - internal mark below the paper's internal minimum      -> fail
 *     (a practical paper uses the practical-IA minimum / maximum when they are set)
 *   - external mark below Curriculum.externalMinMark        -> fail
 *   - otherwise percent = (internal + external) / (internalMax + externalMax) x 100
 *     and the grade is the highest row of Settings.gradingScale whose minPercent is reached
 *   - a failed subject always gets the fail grade (grade point 0)
 *   - only internal and external marks are used; the practical-IA / oral / MCQ / other
 *     components of the curriculum are not read
 */
const evaluate = (subject, entries, ext, scale, failGrade) => {
  if (!entries || !entries.length) {
    const hasInt = subject.internalMax > 0;
    const hasExt = subject.externalMax > 0;
    return {
      state: 'PENDING',
      internal: null,
      external: null,
      max: (hasInt ? subject.internalMax : 0) + (hasExt ? subject.externalMax : 0),
      total: null,
      reason: 'Attendance and marks not entered',
    };
  }

  const ownMark = subject.type === 'PRACTICAL' ? 'practicalInternalMark' : 'theoryInternalMark';
  const borrow = !(subject.type === 'PRACTICAL' && subject.shared); // may the Internal sheet's mark be used?
  const internal = num(
    entries.map((e) => e[ownMark] ?? (borrow ? e.internalMark : null)).find((v) => v !== null && v !== undefined)
  );
  const present = entries.some(
    (e) => (subject.type === 'PRACTICAL' ? e.practicalPresent : e.theoryPresent) !== false
  );
  const external = ext ? num(ext.mark) : null;

  const needInt = subject.internalMax > 0;
  const needExt = subject.externalMax > 0;
  const max = (needInt ? subject.internalMax : 0) + (needExt ? subject.externalMax : 0);
  const base = { internal, external, max, total: null };

  const failed = (extra = {}) => ({
    state: 'DONE', ...base, grade: failGrade.grade, gradePoint: 0, pass: false, ...extra,
  });
  const pending = (reason) => ({ state: 'PENDING', ...base, reason });

  if (needExt && !present && external === null) return failed({ grade: 'AB', absent: true });
  if (needInt && internal === null) return pending('Internal mark not entered');
  if (needInt && internal < subject.internalMin) return failed();
  if (needExt && external === null) {
    return pending(ext ? 'External mark not entered' : 'Barcode not mapped');
  }

  const total = (needInt ? internal : 0) + (needExt ? external : 0);
  const percent = max ? round2((total / max) * 100) : 0;
  if (needExt && external < subject.externalMin) return failed({ total, percent });

  const g = scale.find((s) => percent >= s.minPercent) || failGrade;
  if (!(g.gradePoint > 0)) return failed({ total, percent });

  return {
    state: 'DONE', ...base, total, percent,
    grade: subject.letterGrade ? g.grade : 'Pass',
    gradePoint: g.gradePoint,
    pass: true,
  };
};

/**
 * Live result of one filter set (not saved).
 * Returns { error } when it cannot be computed.
 * With debug = true the result also carries `curriculumDebug`: one line per curriculum row found,
 * saying whether it was kept and why not (use GET /api/results?...&debug=1).
 */
async function buildResult(f, debug = false) {
  const { doc: course, keys: courseKeys } = await courseContext(f.instCode, f.course);
  const semIn = { $in: semesterMatchers(f.semester) };

  const [inst, settings, curriculumRows, entries, mappings] = await Promise.all([
    Institution.findOne({ instCode: f.instCode.toUpperCase() }).lean(),
    Settings().findOne({ key: 'main' }).lean(),
    Curriculum.find({ instCode: f.instCode, course: { $in: courseKeys }, semester: semIn }).lean(),
    AttendanceEntry.find({
      instCode: f.instCode, course: { $in: courseKeys }, batch: f.batch, semester: semIn, examYear: f.examYear,
    }).lean(),
    BarcodeMapping.find({
      instCode: f.instCode, course: { $in: courseKeys }, batch: f.batch, semester: semIn, examYear: f.examYear,
    }).lean(),
  ]);

  // ---- grading scale (Settings page), highest percent first ----
  const scale = (settings?.gradingScale || [])
    .map((g) => ({
      grade: g.grade, description: g.description,
      minPercent: Number(g.minPercent) || 0, gradePoint: Number(g.gradePoint) || 0,
    }))
    .sort((a, b) => b.minPercent - a.minPercent);
  if (!scale.length) return { error: [400, 'Grading scale is not set. Save it in Settings first.'] };
  const lowest = [...scale].sort((a, b) => a.gradePoint - b.gradePoint)[0];
  const failGrade =
    lowest.gradePoint > 0 ? { grade: 'F', description: 'Fail', minPercent: 0, gradePoint: 0 } : lowest;

  // ---- subjects: one column per curriculum paper ----
  // A paper is identified by subject code + component, so the Theory and the Practical row of
  // the same code stay separate. Other duplicates (old batch / regulation rows) are reduced to
  // the best matching row by score().
  const typeOf = (c) => (/practical|clinical/i.test(c.component || '') ? 'PRACTICAL' : 'THEORY');
  const same = (a, b) => String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase();
  const score = (c) =>
    (same(c.batch, f.batch) ? 8 : !String(c.batch || '').trim() ? 4 : 0) +
    (course?.regulation && same(c.regulation, course.regulation) ? 2 : 0) +
    (c.status !== 'Inactive' ? 1 : 0);

  // rows that apply to this batch: not inactive, and not made for another batch.
  // (The old "regulation of the course" filter is gone: a row whose regulation text differed
  //  slightly - "R2022", "2022 " - silently dropped a subject. score() above already prefers the
  //  matching regulation whenever the same paper exists twice.)
  // A subject that has attendance entries in this batch is ALWAYS kept, whatever its status
  // or batch says, so a subject that was actually taught can never drop off the sheet.
  const codesWithEntries = new Set(entries.map((e) => String(e.subCode ?? '').trim()));
  const hasEntries = (c) =>
    codesWithEntries.has(String(c.subCodeP1 ?? '').trim()) ||
    (c.subCodeP2 && codesWithEntries.has(String(c.subCodeP2).trim()));
  const applies = (c) => c.status !== 'Inactive' && (!String(c.batch || '').trim() || same(c.batch, f.batch));
  const usableRows = curriculumRows.filter((c) => applies(c) || hasEntries(c));

  const bestByKey = new Map();
  usableRows.forEach((c) => {
    const key = `${c.subCodeP1}|${typeOf(c)}`;
    const prev = bestByKey.get(key);
    if (!prev || score(c) > score(prev)) bestByKey.set(key, c);
  });
  const picked = [...bestByKey.values()].sort(
    (a, b) =>
      natural(a.subCodeP1, b.subCodeP1) ||
      (typeOf(a) === typeOf(b) ? 0 : typeOf(a) === 'THEORY' ? -1 : 1)
  );

  const curriculumDebug = debug
    ? curriculumRows.map((c) => {
        const key = `${c.subCodeP1}|${typeOf(c)}`;
        let why = 'kept';
        if (!usableRows.includes(c)) {
          why = c.status === 'Inactive'
            ? 'dropped: status Inactive and no attendance entries'
            : `dropped: batch "${c.batch}" is not "${f.batch}" and no attendance entries`;
        } else if (bestByKey.get(key) !== c) {
          why = `dropped: duplicate of ${key} with a better score`;
        }
        return {
          subCodeP1: c.subCodeP1, subCodeP2: c.subCodeP2, component: c.component,
          status: c.status, batch: c.batch, regulation: c.regulation, semester: c.semester, key, why,
        };
      })
    : undefined;

  const codeCount = {};
  picked.forEach((c) => {
    codeCount[c.subCodeP1] = (codeCount[c.subCodeP1] || 0) + 1;
  });
  const subjects = picked.map((c) => {
    const type = typeOf(c);
    const shared = codeCount[c.subCodeP1] > 1; // theory + practical under one code
    return {
      key: `${c.subCodeP1}|${type}`,
      code: c.subCodeP1,
      code2: c.subCodeP2 || '',
      label: shared ? `${c.subCodeP1} ${type === 'PRACTICAL' ? 'P' : 'T'}` : c.subCodeP1,
      shared,
      name: c.subNameP1 || '',
      name2: c.subNameP2 || '',
      type,
      credit: Number(c.credit) || 0,
      addedToSgpa: isYes(c.addedToSgpa),
      letterGrade: isYes(c.letterGradeAwarded),
      conductedBy: c.examConductedBy || '',
      college: !!c.examConductedBy && !/univ/i.test(c.examConductedBy), // not a university exam
      // a practical paper is marked out of its practical-IA maximum when one is set
      ...(type === 'PRACTICAL' && Number(c.practicalIaMax) > 0
        ? { internalMin: Number(c.practicalIaMin) || 0, internalMax: Number(c.practicalIaMax) || 0 }
        : { internalMin: Number(c.internalMinMark) || 0, internalMax: Number(c.internalMaxMark) || 0 }),
      externalMin: Number(c.externalMinMark) || 0,
      externalMax: Number(c.externalMaxMark) || 0,
    };
  });

  // subject code 1 or 2 -> the paper(s) it belongs to
  const keysOfCode = new Map();
  subjects.forEach((s) => {
    [s.code, s.code2].filter(Boolean).forEach((code) => {
      const k = String(code).trim();
      if (!keysOfCode.has(k)) keysOfCode.set(k, []);
      keysOfCode.get(k).push(s.key);
    });
  });
  const typeOfKey = Object.fromEntries(subjects.map((s) => [s.key, s.type]));

  // ---- attendance entries: regNo -> paper -> entries ----
  // (one entry per subject code, so theory and practical of the same code share it)
  const byReg = new Map();
  entries.forEach((e) => {
    const keys = keysOfCode.get(String(e.subCode ?? '').trim());
    if (!keys) return;
    if (!byReg.has(e.regNo)) byReg.set(e.regNo, new Map());
    const m = byReg.get(e.regNo);
    keys.forEach((key) => {
      if (!m.has(key)) m.set(key, []);
      m.get(key).push(e);
    });
  });

  // ---- external marks: paper -> regNo -> { mark } (register no -> barcode -> packet mark) ----
  const rebundles = mappings.length
    ? await Rebundle.find({ mapping: { $in: mappings.map((m) => m._id) } }).lean()
    : [];
  const marksByMapping = new Map();
  rebundles.forEach((rb) => {
    const marks = new Map();
    rb.packets.forEach((p) => p.scripts.forEach((s) => marks.set(s.barcode, s.mark)));
    marksByMapping.set(String(rb.mapping), marks);
  });
  const external = new Map();
  mappings.forEach((m) => {
    const keys = keysOfCode.get(String(m.subCode ?? '').trim());
    if (!keys) return;
    // the paper of the same type (THEORY / PRACTICAL) as the mapping; otherwise the first one
    const key = keys.find((k) => typeOfKey[k] === m.subjectType) || keys[0];
    if (!external.has(key)) external.set(key, new Map());
    const marks = marksByMapping.get(String(m._id));
    m.entries.forEach((e) => {
      external.get(key).set(e.regNo, { mark: marks ? marks.get(e.barcode) ?? null : null });
    });
  });

  // ---- one row per candidate ----
  const entered = [...byReg.keys()].sort(natural);
  const students = await Student.find({ registerNo: { $in: entered } }).select('registerNo studentName dob').lean();
  // A register number that is no longer in the Student master (a deleted student) is left out,
  // even though its old attendance entries still exist. Safety: when NO student is found at all,
  // everyone is kept (that is a problem with the student data, not a deleted student).
  const inMaster = new Set(students.map((s) => s.registerNo));
  const regNos = inMaster.size ? entered.filter((r) => inMaster.has(r)) : entered;
  const nameOf = Object.fromEntries(students.map((s) => [s.registerNo, s.studentName]));
  const dobOf = Object.fromEntries(students.map((s) => [s.registerNo, s.dob || '']));

  const rows = regNos.map((regNo) => {
    const grades = subjects.map((s) =>
      evaluate(s, byReg.get(regNo).get(s.key), external.get(s.key)?.get(regNo), scale, failGrade)
    );

    let creditsTotal = 0;
    let creditsEarned = 0;
    let points = 0;
    let sgpaCredits = 0;
    let pendingCount = 0;
    let failedCount = 0;
    grades.forEach((g, i) => {
      const s = subjects[i];
      if (g.state === 'NA') return;
      creditsTotal += s.credit;
      if (g.state === 'PENDING') {
        pendingCount += 1;
        return;
      }
      if (g.pass) creditsEarned += s.credit;
      else failedCount += 1;
      if (s.addedToSgpa) {
        points += s.credit * g.gradePoint;
        sgpaCredits += s.credit;
      }
    });

    const complete = pendingCount === 0;
    return {
      regNo,
      name: nameOf[regNo] || '—',
      dob: dobOf[regNo] || '',
      grades,
      creditsEarned,
      creditsTotal,
      sgpa: complete && sgpaCredits ? round2(points / sgpaCredits) : null,
      result: !complete ? 'Pending' : failedCount ? 'RA' : 'Pass',
      complete,
      statementNo: null,
    };
  });

  // ---- summary cards ----
  const evaluated = rows.filter((r) => r.complete);
  const passed = evaluated.filter((r) => r.result === 'Pass').length;
  const top = evaluated
    .filter((r) => r.sgpa !== null)
    .sort((a, b) => b.sgpa - a.sgpa)[0];
  const stats = {
    candidates: rows.length,
    fullyEvaluated: evaluated.length,
    passed,
    passRate: rows.length ? Math.round((passed / rows.length) * 100) : 0,
    reappear: evaluated.filter((r) => r.result === 'RA').length,
    highestSgpa: top ? top.sgpa : null,
    highestName: top ? top.name : '',
  };

  return {
    settings,
    info: {
      instName: inst?.instName || f.instCode,
      courseName: course?.courseName || f.course,
      degree: course?.degree || '',
      courseMode: course?.mode || '',
      department: course?.department || '',
      regulation: course?.regulation || '',
      examPattern: course?.examPattern || '',
    },
    subjects,
    rows,
    stats,
    gradingScale: scale,
    curriculumDebug,
  };
}

/**
 * Result of one filter set for other pages (reports):
 * the frozen copy when PUBLISHED, otherwise the live preview (DRAFT).
 */
async function loadResult(f) {
  const sheet = await ResultSheet.findOne(f).lean();
  if (sheet?.status === 'PUBLISHED') {
    return {
      status: 'PUBLISHED', info: sheet.info, subjects: sheet.subjects, rows: sheet.rows,
      gradingScale: sheet.gradingScale,
    };
  }
  const live = await buildResult(f);
  if (live.error) return { error: live.error };
  return {
    status: 'DRAFT', info: live.info, subjects: live.subjects, rows: live.rows,
    gradingScale: live.gradingScale,
  };
}

// used by the report controller
exports.loadResult = loadResult;
exports.courseContext = courseContext;
exports.semesterVariants = semesterVariants;

/* ------------------------------ handlers ------------------------------ */

// GET /api/results/options?instCode=&course=&batch=&semester=
exports.getOptions = async (req, res) => {
  try {
    const { instCode, course, batch, semester } = req.query;
    const out = { instCodes: [], courses: [], batches: [], semesters: [], examYears: [] };

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

      const withBatch = batch ? { ...base, batch } : base;
      out.semesters = (await AttendanceEntry.distinct('semester', withBatch))
        .map(String)
        .sort((a, b) => (semesterNumber(a) || 0) - (semesterNumber(b) || 0));

      if (semester) {
        out.examYears = (
          await AttendanceEntry.distinct('examYear', { ...withBatch, semester: { $in: semesterMatchers(semester) } })
        ).map(String).sort(natural).reverse();
      }
    }

    ok(res, out);
  } catch (err) {
    serverError(res, err);
  }
};

// GET /api/results?instCode=&course=&batch=&semester=&examYear=[&debug=1]
// PUBLISHED -> the frozen copy.  Otherwise -> a live preview (status DRAFT).
// debug=1 adds `curriculumDebug` (every curriculum row found and why it was kept or dropped)
// built from the LIVE data, even when the sheet is published.
exports.getResults = async (req, res) => {
  try {
    const f = pickFilter(req.query);
    if (missingKeys(f).length) return fail(res, 400, `Missing: ${missingKeys(f).join(', ')}`);
    const debug = req.query.debug === '1';

    const [sheet, settings] = await Promise.all([
      ResultSheet.findOne(f).lean(),
      Settings().findOne({ key: 'main' }).select('university').lean(),
    ]);
    const university = settings?.university || {};

    if (sheet?.status === 'PUBLISHED') {
      const students = await Student.find({ registerNo: { $in: sheet.rows.map((r) => r.regNo) } })
        .select('registerNo dob')
        .lean();
      const dobOf = Object.fromEntries(students.map((s) => [s.registerNo, s.dob || '']));
      sheet.rows = sheet.rows.map((r) => ({ ...r, dob: r.dob || dobOf[r.regNo] || '' }));

      let liveInfo = {};
      if (debug) {
        const live = await buildResult(f, true);
        liveInfo = live.error
          ? {}
          : {
              curriculumDebug: live.curriculumDebug,
              liveSubjectCount: live.subjects.length,
              publishedSubjectCount: sheet.subjects.length,
            };
      }
      return ok(res, {
        status: 'PUBLISHED',
        publishedOn: sheet.publishedOn,
        info: sheet.info,
        subjects: sheet.subjects,
        rows: sheet.rows,
        stats: sheet.stats,
        gradingScale: sheet.gradingScale,
        university,
        ...liveInfo,
      });
    }

    const live = await buildResult(f, debug);
    if (live.error) return fail(res, ...live.error);

    ok(res, {
      status: 'DRAFT',
      publishedOn: null,
      withdrawnOn: sheet?.withdrawnOn || null,
      info: live.info,
      subjects: live.subjects,
      rows: live.rows,
      stats: live.stats,
      gradingScale: live.gradingScale,
      university,
      ...(debug ? { curriculumDebug: live.curriculumDebug } : {}),
    });
  } catch (err) {
    serverError(res, err);
  }
};

// POST /api/results/publish   body: the five filters
// Freezes the result and gives every candidate a grade-statement serial number.
exports.publish = async (req, res) => {
  try {
    const f = pickFilter(req.body);
    if (missingKeys(f).length) return fail(res, 400, `Missing: ${missingKeys(f).join(', ')}`);

    const existing = await ResultSheet.findOne(f).lean();
    if (existing?.status === 'PUBLISHED') return fail(res, 409, 'These results are already published.');

    const live = await buildResult(f);
    if (live.error) return fail(res, ...live.error);
    if (!live.rows.length) return fail(res, 400, 'No candidates found for this selection.');

    const pending = live.rows.filter((r) => !r.complete).length;
    if (pending) {
      return fail(
        res, 400,
        `${pending} candidate${pending > 1 ? 's are' : ' is'} not fully evaluated. Enter the missing marks before publishing.`
      );
    }

    // statement serial numbers: keep the numbers given before a withdrawal, add new ones for the rest
    const oldNo = Object.fromEntries((existing?.rows || []).map((r) => [r.regNo, r.statementNo]));
    const fresh = live.rows.filter((r) => !oldNo[r.regNo]);
    let next = 0;
    if (fresh.length) {
      const before = await Settings().findOneAndUpdate(
        { key: 'main' },
        { $inc: { nextGradeStatementSerial: fresh.length } },
        { new: false }
      ).lean();
      if (!before) return fail(res, 400, 'Settings are not saved yet. Save the Settings page first.');
      next = before.nextGradeStatementSerial || 1;
    }
    const rows = live.rows.map((r) => ({ ...r, statementNo: oldNo[r.regNo] || next++ }));

    const sheet = await ResultSheet.findOneAndUpdate(
      f,
      {
        $set: {
          status: 'PUBLISHED',
          info: live.info,
          subjects: live.subjects,
          rows,
          stats: live.stats,
          gradingScale: live.gradingScale,
          publishedOn: new Date(),
          publishedBy: String(req.admin?._id || ''),
          withdrawnOn: null,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    ok(res, { status: sheet.status, candidates: rows.length, publishedOn: sheet.publishedOn }, 201);
  } catch (err) {
    serverError(res, err);
  }
};

// POST /api/results/withdraw   body: the five filters
// Back to DRAFT. Statement numbers are kept and reused when published again.
exports.withdraw = async (req, res) => {
  try {
    const f = pickFilter(req.body);
    if (missingKeys(f).length) return fail(res, 400, `Missing: ${missingKeys(f).join(', ')}`);

    const sheet = await ResultSheet.findOneAndUpdate(
      { ...f, status: 'PUBLISHED' },
      { $set: { status: 'WITHDRAWN', withdrawnOn: new Date() } },
      { new: true }
    );
    if (!sheet) return fail(res, 404, 'These results are not published.');

    ok(res, { status: 'DRAFT' });
  } catch (err) {
    serverError(res, err);
  }
};
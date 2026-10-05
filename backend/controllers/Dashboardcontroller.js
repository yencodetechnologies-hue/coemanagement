const mongoose = require('mongoose');

const ok = (res, data) => res.json({ success: true, data });
const fail = (res, code, message) => res.status(code).json({ success: false, message });

/* ------------------------------------------------------------------ *
 * The dashboard reads many collections. It uses the models your other
 * route files have already registered with Mongoose (looked up by model
 * name), so it does not depend on how the model FILES are named.
 * A model that is not found simply leaves its figure at zero.
 * ------------------------------------------------------------------ */
const model = (...names) => {
  const all = mongoose.modelNames();
  for (const n of names) {
    const hit = all.find((x) => x.toLowerCase() === n.toLowerCase());
    if (hit) return mongoose.model(hit);
  }
  return null;
};

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

// "Semester II" / "II" / "2" -> 2
const semesterNumber = (sem) => {
  const s = String(sem || '').trim();
  const digits = s.match(/\d+/);
  if (digits) return parseInt(digits[0], 10);
  const idx = ROMAN.indexOf(s.replace(/semester/i, '').trim().toUpperCase());
  return idx >= 0 ? idx + 1 : 0;
};
const romanOf = (term) => ROMAN[term - 1] || String(term || '');

// "MAR-2025" -> a number that sorts by date
const examOrder = (examYear) => {
  const m = /([A-Za-z]{3})[A-Za-z]*[\s\-/]*(\d{4})/.exec(String(examYear || ''));
  if (!m) return 0;
  const month = MONTHS.indexOf(m[1].toUpperCase());
  return Number(m[2]) * 12 + (month < 0 ? 0 : month);
};

const natural = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true });
const isPractical = (component) => /practical|clinical/i.test(component || '');
const blank = (v) => v === null || v === undefined;
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const norm = (v) => String(v ?? '').trim();
const pad = (n) => String(n).padStart(2, '0');
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// "equal", ignoring upper / lower case and spaces at the ends (same rule as the attendance sheets)
const escapeRe = (v) => String(v).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const same = (v) => new RegExp(`^\\s*${escapeRe(norm(v))}\\s*$`, 'i');

// one step of the examination cycle
const step = (key, label, done, total, unit) => ({
  key, label, done, total, unit,
  progress: total ? Math.min(1, done / total) : 0,
  complete: total > 0 && done >= total,
});

/**
 * GET /api/dashboard?instCode=&course=&examYear=
 *
 * Where every figure comes from
 * -----------------------------
 * Batches of the session : batch + semester pairs that have attendance entries for the exam year
 * Students on roll       : ACTIVE students of the course in the Student master
 *                          ("records in total" = every student record of the course)
 * 1 Nominal roll         : of the active students in the session's batches, those whose average
 *                          attendance reaches the course minimum (only subjects of the semester's
 *                          curriculum are counted, as on the Nominal roll page)
 * 2 Internal marks       : one sheet per batch + paper (Theory and Practical of a code are two
 *                          papers). A sheet is VERIFIED when its batch has been locked with
 *                          "Verify & lock" on the Attendance & internal marks page.
 *                          A sheet is COMPLETE when every student of the batch has BOTH the
 *                          attendance % and the internal mark of that paper. The dashboard shows
 *                          both, because a batch can be verified while values are still missing.
 * 3 Time table           : papers of the session's semesters that have a date in the time table
 * 4 Hall tickets         : session students that were issued a hall ticket
 * 5 Bar code mapping     : papers (per batch) that have barcodes
 * 6 Re-bundle            : mapped papers that have packets
 * 7 Mark entry           : scripts with an external mark
 * 8 Results              : batches whose result is published
 */
exports.getDashboard = async (req, res) => {
  try {
    const AttendanceEntry = model('AttendanceEntry');
    const Course = model('Course');
    const Curriculum = model('Curriculum');
    const Student = model('Student');
    const TheoryTimeTable = model('TheoryTimeTable');
    const HallTicket = model('HallTicket');
    const BarcodeMapping = model('BarcodeMapping');
    const Rebundle = model('Rebundle');
    const ResultSheet = model('ResultSheet');
    const Settings = model('Settings', 'Setting');
    const CoeStaff = model('CoeStaff');
    const Role = model('Role');
    const AuditLog = model('AuditLog');
    const MarksLock = model('MarksLock'); // batch-wide "Verify & lock"

    if (!AttendanceEntry || !Course) return fail(res, 500, 'Course / attendance models are not loaded.');

    const settings = Settings ? await Settings.findOne({ key: 'main' }).lean() : null;

    // ---- which exam session ----
    // 1. the one asked for  2. the active session in Settings  3. the latest one with data
    let examYear = norm(req.query.examYear);
    const sessionsWithData = (await AttendanceEntry.distinct('examYear'))
      .map(String)
      .sort((a, b) => examOrder(b) - examOrder(a));
    if (!examYear) examYear = settings?.sessions?.find((s) => s.active)?.name || sessionsWithData[0] || '';

    // ---- which course ----
    const courses = (await Course.find().select('instCode courseCode courseName regulation attendancePercentage').lean())
      .sort((a, b) => natural(a.courseCode, b.courseCode));
    const wantInst = norm(req.query.instCode);
    const wantCourse = norm(req.query.course);
    let course = courses.find((c) => c.courseCode === wantCourse && (!wantInst || c.instCode === wantInst));
    if (!course) {
      // the first course that has entries in this session, else the first course
      const active = new Set(await AttendanceEntry.distinct('course', examYear ? { examYear } : {}));
      course = courses.find((c) => active.has(c.courseCode) || active.has(c.courseName)) || courses[0] || null;
    }

    const base = {
      university: settings?.university?.name || '',
      examYear,
      sessions: sessionsWithData,
      courses: courses.map((c) => ({ instCode: c.instCode, courseCode: c.courseCode, courseName: c.courseName })),
      course: course ? { instCode: course.instCode, courseCode: course.courseCode, courseName: course.courseName } : null,
    };
    if (!course) {
      return ok(res, { ...base, groups: [], steps: [], stats: {}, upcoming: [], pendingSheets: [], recent: [], internalMode: 'entry' });
    }

    // the course is stored as its code in some collections and as its name in others
    const courseKeys = [...new Set([course.courseCode, course.courseName].filter(Boolean))];
    const scope = { instCode: course.instCode, course: { $in: courseKeys }, examYear };
    const minAttendance = course.attendancePercentage ?? 75;

    // exam sessions in which THIS course has anything saved (attendance / marks or a time table).
    // Used to point to the right session when the selected one is empty.
    const courseAnySession = { instCode: course.instCode, course: { $in: courseKeys } };
    const [entrySessions, timetableSessions] = await Promise.all([
      AttendanceEntry.distinct('examYear', courseAnySession),
      TheoryTimeTable ? TheoryTimeTable.distinct('examYear', courseAnySession) : [],
    ]);
    const courseSessions = [...new Set([...entrySessions, ...timetableSessions].map(String).filter(Boolean))]
      .sort((a, b) => examOrder(b) - examOrder(a));

    const [entries, curriculumAll, timetables, ticketRegNos, mappings, publishedCount, studentDocs, staffCount, roleCount, recentLogs, locks] =
      await Promise.all([
        AttendanceEntry.find(scope)
          .select('regNo batch semester subCode attendance theoryAttendance practicalAttendance internalMark theoryInternalMark practicalInternalMark')
          .lean(),
        Curriculum
          ? Curriculum.find({ instCode: course.instCode, course: { $in: courseKeys }, status: { $ne: 'Inactive' } }).lean()
          : [],
        TheoryTimeTable ? TheoryTimeTable.find(scope).lean() : [],
        HallTicket ? HallTicket.distinct('regNo', scope) : [],
        BarcodeMapping ? BarcodeMapping.find(scope).select('_id').lean() : [],
        ResultSheet ? ResultSheet.countDocuments({ ...scope, status: 'PUBLISHED' }) : 0,
        // Student master: code = institution code, course = course name or code
        Student
          ? Student.find({ code: same(course.instCode), course: { $in: courseKeys.map(same) } })
              .select('registerNo batch status')
              .lean()
          : [],
        CoeStaff ? CoeStaff.countDocuments({ status: 'Active' }) : 0,
        Role ? Role.estimatedDocumentCount() : 0,
        AuditLog ? AuditLog.find().sort({ createdAt: -1 }).limit(6).lean() : [],
        MarksLock ? MarksLock.find({ ...scope, locked: true }).select('batch').lean() : [],
      ]);

    /* ---------- curriculum of the course (its own regulation, when rows of it exist) ---------- */
    const ofRegulation = curriculumAll.filter((c) => !course.regulation || norm(c.regulation) === norm(course.regulation));
    const curriculumRows = ofRegulation.length ? ofRegulation : curriculumAll;

    const nameOfCode = new Map();
    curriculumRows.forEach((c) => {
      if (!nameOfCode.has(c.subCodeP1)) nameOfCode.set(c.subCodeP1, c.subNameP1);
      if (c.subCodeP2 && !nameOfCode.has(c.subCodeP2)) nameOfCode.set(c.subCodeP2, c.subNameP2 || c.subNameP1);
    });

    // papers of one semester for one batch: one per subject code AND type (Theory / Practical)
    const papersOf = (term, batch) => {
      const byKey = new Map();
      curriculumRows.forEach((c) => {
        if (semesterNumber(c.semester) !== term) return;
        if (norm(c.batch) && norm(c.batch) !== norm(batch)) return; // a row made for another batch
        const type = isPractical(c.component) ? 'P' : 'T';
        const key = `${c.subCodeP1}|${type}`;
        if (!byKey.has(key) || norm(c.batch)) {
          byKey.set(key, { code: c.subCodeP1, label: c.subCodeP2 ? `${c.subCodeP1}-${c.subCodeP2}` : c.subCodeP1, name: c.subNameP1, type });
        }
      });
      const list = [...byKey.values()];
      const perCode = {};
      list.forEach((p) => { perCode[p.code] = (perCode[p.code] || 0) + 1; });
      return list
        .map((p) => ({ ...p, both: perCode[p.code] > 1 }))
        .sort((a, b) => natural(a.code, b.code) || (a.type === b.type ? 0 : a.type === 'T' ? -1 : 1));
    };

    /* ---------- batches / semesters writing in this session ---------- */
    const groupMap = new Map();
    const entriesOf = new Map(); // regNo -> entries
    entries.forEach((e) => {
      const term = semesterNumber(e.semester);
      const gKey = `${norm(e.batch)}|${term}`;
      if (!groupMap.has(gKey)) groupMap.set(gKey, { batch: norm(e.batch), term, semester: romanOf(term) });
      if (!entriesOf.has(e.regNo)) entriesOf.set(e.regNo, []);
      entriesOf.get(e.regNo).push({ ...e, term });
    });
    const groups = [...groupMap.values()].sort((a, b) => natural(a.batch, b.batch) || a.term - b.term);
    const sessionBatches = new Set(groups.map((g) => g.batch));

    /* ---------- students ---------- */
    const activeStudents = studentDocs.filter((s) => s.status !== 'Inactive');
    // students of the session: active students of the batches above; when the master has none
    // for those batches, the register numbers that have entries
    const sessionStudents = activeStudents.filter((s) => sessionBatches.has(norm(s.batch)));
    const rollByBatch = new Map();
    const addToRoll = (batch, regNo) => {
      const b = norm(batch);
      if (!rollByBatch.has(b)) rollByBatch.set(b, new Set());
      rollByBatch.get(b).add(regNo);
    };
    if (sessionStudents.length) sessionStudents.forEach((s) => addToRoll(s.batch, s.registerNo));
    else entries.forEach((e) => addToRoll(e.batch, e.regNo));
    const sessionRegNos = new Set([...rollByBatch.values()].flatMap((set) => [...set]));
    const sessionRoll = sessionRegNos.size;

    /* ---------- 1. nominal roll: eligible by attendance ---------- */
    const codesOfTerm = new Map(); // term -> subject codes of the curriculum
    const termCodes = (term) => {
      if (!codesOfTerm.has(term)) {
        codesOfTerm.set(term, new Set(curriculumRows.filter((c) => semesterNumber(c.semester) === term).map((c) => c.subCodeP1)));
      }
      return codesOfTerm.get(term);
    };
    let eligible = 0;
    sessionRegNos.forEach((regNo) => {
      const values = (entriesOf.get(regNo) || [])
        .filter((e) => !termCodes(e.term).size || termCodes(e.term).has(e.subCode)) // only subjects of the semester
        .map((e) => e.attendance)
        .filter(isNum);
      if (!values.length) return;
      if (Math.round(values.reduce((a, b) => a + b, 0) / values.length) >= minAttendance) eligible += 1;
    });

    /* ---------- 2. internal mark sheets: one per batch + paper ---------- */
    const lockedBatches = new Set(locks.map((l) => norm(l.batch)));
    const canVerify = Boolean(MarksLock); // the batch-wide Verify & lock is installed
    // the internal mark of a paper: the mark of its own sheet, else the Internal sheet's mark
    const markOf = (e, type) => (type === 'P' ? e.practicalInternalMark ?? e.internalMark : e.theoryInternalMark ?? e.internalMark);
    // the attendance of a paper: the attendance of its own sheet; an entry from before theory and
    // practical were separated has one shared value, which counts for both
    const attendanceOf = (e, type) => {
      const own = type === 'P' ? e.practicalAttendance : e.theoryAttendance;
      if (!blank(own)) return own;
      return blank(e.theoryAttendance) && blank(e.practicalAttendance) ? e.attendance ?? null : null;
    };

    const sheets = [];
    groups.forEach((g) => {
      const roll = rollByBatch.get(g.batch) || new Set();
      papersOf(g.term, g.batch).forEach((p) => {
        let entered = 0; // students with the internal mark
        let attendanceEntered = 0; // students with the attendance %
        roll.forEach((regNo) => {
          const e = (entriesOf.get(regNo) || []).find((x) => x.term === g.term && x.subCode === p.code);
          if (!e) return;
          if (!blank(markOf(e, p.type))) entered += 1;
          if (!blank(attendanceOf(e, p.type))) attendanceEntered += 1;
        });
        sheets.push({
          batch: g.batch,
          term: g.term,
          paper: p,
          entered,
          attendanceEntered,
          total: roll.size,
          complete: roll.size > 0 && entered >= roll.size && attendanceEntered >= roll.size,
          verified: lockedBatches.has(g.batch),
        });
      });
    });
    const sheetDone = (s) => (canVerify ? s.verified : s.complete);
    const sheetsDone = sheets.filter(sheetDone).length;
    // sheets that need attention: values missing (whether the batch is verified or not), and,
    // when verification is in use, complete sheets that are not verified yet
    const needsAttention = (s) => !s.complete || (canVerify && !s.verified);
    const pendingSheets = sheets
      .filter(needsAttention)
      // the sheets that still miss values come first, then by batch and subject
      .sort((a, b) => Number(a.complete) - Number(b.complete) || natural(a.batch, b.batch) || natural(a.paper.code, b.paper.code))
      .slice(0, 6)
      .map((s) => ({
        subCode: s.paper.label,
        subName: s.paper.name || '',
        subjectType: s.paper.both ? (s.paper.type === 'P' ? 'Practical' : 'Theory') : '',
        batch: s.batch,
        semester: romanOf(s.term),
        entered: s.entered,                     // internal marks entered
        attendanceEntered: s.attendanceEntered, // attendance entered
        total: s.total,
        complete: s.complete,
        verified: s.verified,
      }));

    // attendance and internal marks of every batch of the session, in one line each
    const marksSummary = groups.map((g) => {
      const own = sheets.filter((s) => s.batch === g.batch && s.term === g.term);
      const sum = (pick) => own.reduce((n, s) => n + pick(s), 0);
      return {
        batch: g.batch,
        semester: g.semester,
        students: (rollByBatch.get(g.batch) || new Set()).size,
        sheets: own.length,
        sheetsComplete: own.filter((s) => s.complete).length,
        attendanceEntered: sum((s) => s.attendanceEntered),
        marksEntered: sum((s) => s.entered),
        expected: sum((s) => s.total), // students x papers
        verified: lockedBatches.has(g.batch),
      };
    });

    /* ---------- 3. time table ---------- */
    const sessionPaperKeys = new Set(); // term|code|type, each paper of the session's semesters once
    groups.forEach((g) => papersOf(g.term, g.batch).forEach((p) => sessionPaperKeys.add(`${g.term}|${p.code}|${p.type}`)));
    const scheduledKeys = new Set();
    timetables.forEach((t) => {
      const term = t.term || semesterNumber(t.semester);
      (t.entries || []).forEach((e) => {
        if (e.examDate) scheduledKeys.add(`${term}|${e.subCode}|${isPractical(e.component) ? 'P' : 'T'}`);
      });
    });
    const papersTotal = sessionPaperKeys.size || scheduledKeys.size;
    const scheduled = sessionPaperKeys.size
      ? [...scheduledKeys].filter((k) => sessionPaperKeys.has(k)).length
      : scheduledKeys.size;

    const now = today();
    const upcoming = timetables
      .flatMap((t) =>
        (t.entries || []).map((e) => ({
          subCode: e.subCode,
          subName: e.subName || nameOfCode.get(e.subCode) || '',
          component: e.component || '',
          examDate: e.examDate,
          session: e.session,
          semester: romanOf(t.term || semesterNumber(t.semester)),
        }))
      )
      .filter((e) => e.examDate && e.examDate >= now)
      .sort((a, b) => a.examDate.localeCompare(b.examDate) || (a.session === b.session ? 0 : a.session === 'FN' ? -1 : 1))
      .slice(0, 6);

    /* ---------- 4. hall tickets ---------- */
    const ticketsIssued = sessionRoll
      ? ticketRegNos.filter((r) => sessionRegNos.has(r)).length
      : ticketRegNos.length;

    /* ---------- 5 to 7. bar codes, packets, marks ---------- */
    const rebundles =
      Rebundle && mappings.length
        ? await Rebundle.find({ mapping: { $in: mappings.map((m) => m._id) } }).select('packets.scripts.mark').lean()
        : [];
    let scripts = 0;
    let marked = 0;
    rebundles.forEach((rb) =>
      (rb.packets || []).forEach((p) =>
        (p.scripts || []).forEach((s) => {
          scripts += 1;
          if (!blank(s.mark)) marked += 1;
        })
      )
    );
    const papersToMap = Math.max(sheets.length, mappings.length); // one mapping per batch + paper

    const steps = [
      step('nominal', 'Nominal roll', eligible, sessionRoll, 'eligible'),
      step('internal', 'Internal marks', sheetsDone, sheets.length, canVerify ? 'verified' : 'sheets entered'),
      step('timetable', 'Time table', scheduled, papersTotal, 'scheduled'),
      step('halltickets', 'Hall tickets', ticketsIssued, sessionRoll, 'issued'),
      step('barcode', 'Bar code mapping', mappings.length, papersToMap, 'papers'),
      step('rebundle', 'Re-bundle', rebundles.length, mappings.length, 'papers bundled'),
      step('marks', 'Mark entry', marked, scripts, 'scripts'),
      step('results', 'Results', publishedCount, groups.length, 'published'),
    ];

    // every paper of the course (all semesters), counted once
    const subjectKeys = new Set(
      curriculumRows.map((c) => `${semesterNumber(c.semester)}|${c.subCodeP1}|${isPractical(c.component) ? 'P' : 'T'}`)
    );

    ok(res, {
      ...base,
      groups,
      steps,
      // 'verify' : internal sheets are counted as verified / awaiting verification
      // 'entry'  : the batch-wide lock is not installed, so they are counted as entered / awaiting entry
      internalMode: canVerify ? 'verify' : 'entry',
      // does the selected session have anything for this course? If not, which session does?
      hasData: groups.length > 0 || timetables.length > 0 || mappings.length > 0 || ticketRegNos.length > 0,
      courseSessions,
      suggestedSession:
        groups.length > 0 || timetables.length > 0 || mappings.length > 0 || ticketRegNos.length > 0
          ? ''
          : courseSessions.find((s) => s !== examYear) || '',
      stats: {
        studentsOnRoll: activeStudents.length || sessionRoll, // ACTIVE students of the course
        totalStudents: studentDocs.length || sessionRoll,     // every student record of the course
        sessionStudents: sessionRoll,                         // students in the batches of this session
        subjects: subjectKeys.size,
        regulation: course.regulation || '',
        sheetsPending: sheets.filter(needsAttention).length, // values missing, or not verified yet
        sheetsIncomplete: sheets.filter((s) => !s.complete).length, // attendance or mark missing
        sheetsComplete: sheets.filter((s) => s.complete).length,
        sheetsTotal: sheets.length,
        verifiedBatches: [...lockedBatches].filter((b) => sessionBatches.has(b)).length,
        sessionBatches: sessionBatches.size,
        staff: staffCount,
        roles: roleCount,
        minAttendance,
      },
      upcoming,
      pendingSheets,
      marksSummary,
      recent: recentLogs.map((l) => ({
        _id: l._id,
        title: String(l.summary || '').replace(/ \(failed\)$/, ''),
        detail: l.changes?.length
          ? `${l.changes.length} field${l.changes.length > 1 ? 's' : ''} changed`
          : l.message || l.module || '',
        failed: l.success === false,
        staffName: l.staffName || '',
        at: l.createdAt,
      })),
    });
  } catch (err) {
    fail(res, 500, err.message || 'Server error');
  }
};
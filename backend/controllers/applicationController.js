const mongoose = require('mongoose');
const AttendanceEntry = require('../models/Attendanceentry');
const Student = require('../models/Student');
const Course = require('../models/Course');
const Curriculum = require('../models/Curriculum');
const Institution = require('../models/Institution');
const TheoryTimeTable = require('../models/TheoryTimeTable');
const HallTicket = require('../models/HallTicket');
const Counter = require('../models/Counter');
const ExamApplicationSetting = require('../models/ExamApplicationSetting');

const KEYS = ['instCode', 'course', 'batch', 'semester', 'examYear', 'studentCategory'];
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const REGULAR_RE = /^regular$/i;
const COSTS = [
  'applicationCost', 'markSheetCost', 'provisional1Cost',
  'provisional2Cost', 'convocationCost', 'penalty',
];

const fail = (res, code, message) => res.status(code).json({ success: false, message });

// "Semester VI" / "VI" / "6" / "Semester 6" -> 6
const termOf = (semester) => {
  const s = String(semester || '').trim();
  const d = /(\d+)\s*$/.exec(s);
  if (d) return Number(d[1]);
  const m = /([ivx]+)\s*$/i.exec(s);
  const i = m ? ROMAN.indexOf(m[1].toUpperCase()) : -1;
  return i + 1;
};

// pick the six filter values from a query string / body
const readFilters = (src) => {
  const f = {};
  for (const k of KEYS) {
    if (!src[k]) return { error: `${k} is required` };
    f[k] = String(src[k]);
  }
  return { f };
};

const defaultSettings = {
  addOnTitle: '', lastDate: '', penaltyDate: '',
  applicationCost: 0, markSheetCost: 0, provisional1Cost: 0,
  provisional2Cost: 0, convocationCost: 0, penalty: 0, applyPenalty: false,
};

const groupByReg = (rows) => {
  const m = new Map();
  rows.forEach((e) => {
    if (!m.has(e.regNo)) m.set(e.regNo, []);
    m.get(e.regNo).push(e);
  });
  return m;
};

const avgOf = (list) => {
  const v = list.filter((e) => e.attendance != null).map((e) => e.attendance);
  return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null;
};

/**
 * Build candidates, papers and fees for one filter set.
 *
 * INTERNAL MARKS (from the Attendance & internal marks page)
 *   Each sheet type keeps its own mark on the attendance entry:
 *     Theory sheet    -> theoryInternalMark      checked against the Theory row's internal minimum
 *     Practical sheet -> practicalInternalMark   checked against the Practical row's practical-IA
 *                                                minimum (its internal minimum when no practical IA is set)
 *     Internal sheet  -> internalMark            used when the Theory / Practical sheet has no mark
 *
 * REGULAR category
 *   - candidates   : students with REGULAR attendance entries
 *   - attendance   : average must be >= course minimum, otherwise 0 papers
 *   - papers       : counted only if the internal mark >= the minimum
 *   - arrearPapers : papers whose internal mark is BELOW the minimum.
 *                    They are NOT counted in papers / papersCount / examFee, but are
 *                    sent to the frontend so the HALL TICKET prints them as (Arrear).
 *
 * THEORY + PRACTICAL UNDER ONE SUBJECT CODE
 *   - when the curriculum has a Theory row and a Practical row with the same subject code,
 *     the Theory row is the paper (application form, paper count and fee stay as before)
 *   - the Practical row goes in practicalPapers: hall ticket only, not counted in
 *     papersCount / examFee.
 *   - the practical is judged on its OWN mark (Practical sheet). When that mark is not entered,
 *     it follows its theory paper: listed when the theory paper is listed, and marked arrear
 *     when the theory paper is an arrear paper.
 *   - its date and session come from the practical's own row in the time table
 *     (blank until that row is scheduled).
 *
 * ARREAR category
 *   - arrear papers = (a) the same students' REGULAR papers whose internal mark is
 *                         BELOW the curriculum minimum (attendance must be fine), plus
 *                     (b) papers from explicit ARREAR attendance entries
 *   - listed candidates = students that have at least one arrear paper, or an explicit
 *                         ARREAR entry
 *   - arrearPapers is empty here (every paper in `papers` is already an arrear paper)
 *
 * ADAPT the rules inside `evaluate` if your regulations differ.
 */
async function buildApplication(f) {
  const course = await Course.findOne({
    instCode: f.instCode,
    $or: [{ courseCode: f.course }, { courseName: f.course }],
  }).lean();
  if (!course) return null;

  const term = termOf(f.semester);
  const roman = ROMAN[term - 1] || '';
  const semesterValues = [
    String(term),
    ...(roman ? [roman, `Semester ${roman}`, `SEMESTER ${roman}`] : []),
    f.semester,
  ];
  const courseKeys = [f.course, course.courseCode, course.courseName];
  const minAttendance = course.attendancePercentage ?? 75;
  const isArrear = /arrear/i.test(f.studentCategory);

  const base = {
    instCode: f.instCode,
    course: f.course,
    batch: f.batch,
    semester: f.semester,
    examYear: f.examYear,
  };

  // are the internal marks of this batch verified and locked? (Attendance & internal marks page)
  const MarksLock = mongoose.models.MarksLock;
  const marksLock = MarksLock
    ? await MarksLock.findOne({
        instCode: f.instCode, course: { $in: courseKeys }, batch: f.batch, examYear: f.examYear,
      }).select('locked lockedOn').lean()
    : null;

  const [inst, curriculum, ownEntries, regularEntries, timetable, tickets, saved] =
    await Promise.all([
      Institution.findOne({ instCode: f.instCode.toUpperCase() }).lean(),
      Curriculum.find({
        instCode: f.instCode,
        course: { $in: courseKeys },
        regulation: course.regulation,
        semester: { $in: semesterValues },
        status: 'Active',
        $or: [{ batch: '' }, { batch: f.batch }],
      })
        .sort({ subCodeP1: 1 })
        .lean(),
      AttendanceEntry.find(f).lean(),
      // for ARREAR we also read the REGULAR entries to find low-internal papers
      isArrear
        ? AttendanceEntry.find({ ...base, studentCategory: REGULAR_RE }).lean()
        : Promise.resolve(null),
      TheoryTimeTable.findOne({
        instCode: f.instCode,
        course: course.courseCode,
        term,
        examYear: f.examYear,
      }).lean(),
      HallTicket.find(f).lean(),
      ExamApplicationSetting.findOne(f).lean(),
    ]);

  // curriculum lookup by subject code (code 1 and code 2).
  // One code can have a Theory row AND a Practical row, and both are kept:
  //   bySub.get(code) -> the paper of that code: the Theory row (the Practical row if there is no theory)
  //   twinOf(code)    -> the Practical row that shares the code with a Theory row, else null
  const isPractical = (c) => /practical|clinical/i.test(c.component || '');
  const rowsByCode = new Map(); // code -> { THEORY: row, PRACTICAL: row }
  curriculum.forEach((c) => {
    [c.subCodeP1, c.subCodeP2].filter(Boolean).forEach((code) => {
      if (!rowsByCode.has(code)) rowsByCode.set(code, {});
      const rows = rowsByCode.get(code);
      const type = isPractical(c) ? 'PRACTICAL' : 'THEORY';
      // a row made for this batch wins over a common (blank batch) row
      if (!rows[type] || c.batch === f.batch) rows[type] = c;
    });
  });
  const bySub = {
    get: (code) => {
      const rows = rowsByCode.get(code);
      return rows ? rows.THEORY || rows.PRACTICAL : undefined;
    },
  };
  const twinOf = (code) => {
    const rows = rowsByCode.get(code);
    return rows && rows.THEORY && rows.PRACTICAL ? rows.PRACTICAL : null;
  };
  // time table entries. New entries carry the component (Theory / Practical), so the two papers
  // of one subject code have their own date. Older entries have no component: they belong to the
  // main paper of that code.
  const compKey = (code, component) => `${code}::${String(component || '').trim().toLowerCase()}`;
  const slotByKey = new Map();
  const slotByCode = {};
  (timetable?.entries || []).forEach((e) => {
    if (e.component) slotByKey.set(compKey(e.subCode, e.component), e);
    else slotByCode[e.subCode] = e;
  });
  const slotOf = (c) => slotByKey.get(compKey(c.subCodeP1, c.component)) || null;
  const ticketByReg = Object.fromEntries(tickets.map((t) => [t.regNo, t.hallTicketNo]));

  // the internal mark and minimum of a paper, by its type
  const blank = (v) => v === null || v === undefined;
  const pick = (...values) => {
    const v = values.find((x) => !blank(x));
    return blank(v) ? null : v;
  };
  const markOf = (c, e) =>
    isPractical(c) ? pick(e.practicalInternalMark, e.internalMark) : pick(e.theoryInternalMark, e.internalMark);
  const minOf = (c) =>
    isPractical(c) && Number(c.practicalIaMax) > 0 ? Number(c.practicalIaMin) || 0 : Number(c.internalMinMark) || 0;

  const ownByReg = groupByReg(ownEntries);
  const regularByReg = isArrear ? groupByReg(regularEntries) : ownByReg;

  // Attendance average: only the subjects of this semester's curriculum are counted (same rule
  // as the nominal roll). An entry saved under a subject code that is not in the semester cannot
  // be seen or corrected on the attendance page, so it must not pull the average down.
  const inSemester = (e) => Boolean(bySub.get(e.subCode));
  const attendanceOf = (list) => avgOf((list || []).filter(inSemester));

  const allRegNos = [
    ...new Set([...ownByReg.keys(), ...(isArrear ? regularByReg.keys() : [])]),
  ].sort();

  // ---- decide the papers of one student ----
  const evaluate = (regNo) => {
    const papers = [];
    const arrearPapers = []; // REGULAR student's low-internal papers, printed on the hall ticket
    const practicalPapers = []; // Practical row sharing a subject code with a theory paper (hall ticket only)
    const remarks = [];
    const seen = new Set();

    const addPaper = (c, e, target = papers) => {
      if (seen.has(String(c._id))) return;
      seen.add(String(c._id));
      const slot = slotOf(c) || slotByCode[c.subCodeP1] || slotByCode[e.subCode];
      target.push({
        subCode: c.subCodeP1,
        subName: c.subNameP1,
        component: c.component,
        amount: c.examAmount,
        examDate: slot?.examDate || '',
        session: slot?.session || '',
      });
    };

    // The Practical row that shares a subject code with a theory paper (hall ticket only).
    //   theory: 'regular' | 'arrear' | 'none' (theory paper not listed)
    const addPractical = (c, e, theory) => {
      const twin = twinOf(e.subCode) || twinOf(c.subCodeP1);
      if (!twin || seen.has(String(twin._id))) return;

      const own = pick(e.practicalInternalMark); // the Practical sheet's own mark
      let arrear;
      if (own === null) {
        if (theory === 'none') return; // nothing entered for the practical: it follows the theory paper
        arrear = isArrear || theory === 'arrear';
      } else {
        arrear = own < minOf(twin);
        if (isArrear && !arrear) return; // ARREAR list: a passed practical is not an arrear
        if (arrear) remarks.push(`${twin.subCodeP1} (Practical): internal ${own} below ${minOf(twin)} (arrear)`);
      }

      seen.add(String(twin._id));
      const twinSlot = slotOf(twin); // its own date, when the time table has one for the practical
      practicalPapers.push({
        subCode: twin.subCodeP1,
        subName: twin.subNameP1,
        component: twin.component,
        amount: twin.examAmount,
        examDate: twinSlot?.examDate || '',
        session: twinSlot?.session || '',
        isArrear: arrear,
      });
    };

    if (!isArrear) {
      // ---------- REGULAR ----------
      const list = ownByReg.get(regNo) || [];
      const avg = attendanceOf(list);
      if (avg === null || avg < minAttendance) {
        remarks.push(
          avg === null ? 'Attendance not entered' : `Attendance ${avg}% below ${minAttendance}%`
        );
      } else {
        for (const e of list) {
          const c = bySub.get(e.subCode);
          if (!c) continue;
          const mark = markOf(c, e);
          const min = minOf(c);
          if (mark === null) {
            remarks.push(`${c.subCodeP1}: internal mark pending`);
            addPractical(c, e, 'none');
          } else if (mark < min) {
            // low internal mark -> arrear paper, still printed on the hall ticket
            addPaper(c, e, arrearPapers);
            remarks.push(`${c.subCodeP1}: internal ${mark} below ${min} (arrear)`);
            addPractical(c, e, 'arrear');
          } else {
            addPaper(c, e);
            addPractical(c, e, 'regular');
          }
        }
      }
    } else {
      // ---------- ARREAR ----------
      // (a) low internal mark in the student's REGULAR papers
      const reg = regularByReg.get(regNo) || [];
      const regAvg = attendanceOf(reg);
      if (reg.length && regAvg !== null && regAvg >= minAttendance) {
        for (const e of reg) {
          const c = bySub.get(e.subCode);
          if (!c) continue;
          const mark = markOf(c, e);
          const min = minOf(c);
          if (mark !== null && mark < min) {
            addPaper(c, e);
            remarks.push(`${c.subCodeP1}: arrear, internal ${mark} below ${min}`);
            addPractical(c, e, 'arrear');
          } else {
            addPractical(c, e, 'none'); // a practical that failed on its own mark
          }
        }
      }
      // (b) explicit ARREAR entries
      for (const e of ownByReg.get(regNo) || []) {
        const c = bySub.get(e.subCode);
        if (!c) continue;
        addPaper(c, e);
        addPractical(c, e, 'arrear');
      }
    }

    papers.sort((a, b) => a.subCode.localeCompare(b.subCode));
    arrearPapers.sort((a, b) => a.subCode.localeCompare(b.subCode));
    practicalPapers.sort((a, b) => a.subCode.localeCompare(b.subCode));
    const attList = (isArrear ? regularByReg.get(regNo) || ownByReg.get(regNo) : ownByReg.get(regNo)) || [];
    return {
      regNo,
      explicit: ownByReg.has(regNo),
      papers,
      arrearPapers,
      practicalPapers,
      remarks,
      avgAttendance: attendanceOf(attList),
    };
  };

  let evaluated = allRegNos.map(evaluate);
  if (isArrear) {
    // list only students that actually have arrear papers (or an explicit arrear entry)
    evaluated = evaluated.filter((r) => r.explicit || r.papers.length > 0 || r.practicalPapers.length > 0);
  }

  const students = await Student.find({
    registerNo: { $in: evaluated.map((r) => r.regNo) },
  }).lean();
  const studentByReg = Object.fromEntries(students.map((s) => [s.registerNo, s]));

  const candidates = evaluated.map((r, i) => {
    const s = studentByReg[r.regNo] || {};
    return {
      sno: i + 1,
      regNo: r.regNo,
      name: s.studentName || '—',
      gender: s.gender || '',
      dob: s.dob || '',
      photoUrl: s.photoUrl || '',
      avgAttendance: r.avgAttendance,
      papers: r.papers,
      papersCount: r.papers.length,
      // hall ticket only: not included in papersCount or examFee
      arrearPapers: r.arrearPapers,
      // hall ticket only: Practical rows that share a subject code with a theory paper
      practicalPapers: r.practicalPapers,
      examFee: r.papers.reduce((sum, p) => sum + (p.amount || 0), 0),
      remarks: r.remarks.join('; '),
      hallTicketNo: ticketByReg[r.regNo] || '',
    };
  });

  const distinct = (field) => [...new Set(curriculum.map((c) => c[field]).filter(Boolean))];

  return {
    info: {
      instName: inst?.instName || f.instCode,
      headDesignation: inst?.headDesignation || '',
      courseName: course.courseName,
      degree: course.degree,
      courseMode: course.mode,
      department: course.department,
      regulation: course.regulation,
      examPattern: course.examPattern,
      minAttendance,
      subjectCategory: distinct('subjectCategory').join(' / '),
      status: distinct('mode').join(' / '),
      hasTimetable: !!timetable,
      curriculumCount: curriculum.length,
      // true / false; null when the marks-lock module is not installed
      marksVerified: MarksLock ? Boolean(marksLock?.locked) : null,
      marksVerifiedOn: marksLock?.locked ? marksLock.lockedOn : null,
    },
    candidates,
    settings: saved ? { ...defaultSettings, ...saved } : defaultSettings,
  };
}

// GET /options  -> distinct values for the dropdowns
exports.getOptions = async (req, res) => {
  try {
    const entries = await Promise.all(
      KEYS.map(async (k) => [k, (await AttendanceEntry.distinct(k)).sort()])
    );
    res.json({ success: true, data: Object.fromEntries(entries) });
  } catch (err) {
    fail(res, 500, err.message);
  }
};

// GET /?instCode=&course=&batch=&semester=&examYear=&studentCategory=
exports.getApplication = async (req, res) => {
  try {
    const { f, error } = readFilters(req.query);
    if (error) return fail(res, 400, error);

    const data = await buildApplication(f);
    if (!data) return fail(res, 404, 'Course not found for this institution');
    res.json({ success: true, data });
  } catch (err) {
    fail(res, 500, err.message);
  }
};

// PUT /settings   body: { ...filters, settings: {...} }
exports.saveSettings = async (req, res) => {
  try {
    const { f, error } = readFilters(req.body);
    if (error) return fail(res, 400, error);

    const s = req.body.settings || {};
    const update = {
      addOnTitle: String(s.addOnTitle || '').trim(),
      applyPenalty: !!s.applyPenalty,
    };
    for (const k of ['lastDate', 'penaltyDate']) {
      if (s[k] && !DATE_RE.test(s[k])) return fail(res, 400, `Invalid ${k}`);
      update[k] = s[k] || '';
    }
    for (const k of COSTS) {
      const n = Number(s[k] || 0);
      if (!Number.isFinite(n) || n < 0) return fail(res, 400, `${k} must be a non-negative number`);
      update[k] = n;
    }

    await ExamApplicationSetting.findOneAndUpdate(
      f,
      { $set: update },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
    );
    res.json({ success: true, data: { saved: true } });
  } catch (err) {
    fail(res, 500, err.message);
  }
};

// POST /hall-tickets/issue   body: { ...filters, regNos: [...] }
exports.issueHallTickets = async (req, res) => {
  try {
    const { f, error } = readFilters(req.body);
    if (error) return fail(res, 400, error);

    const data = await buildApplication(f);
    if (!data) return fail(res, 404, 'Course not found for this institution');

    const wanted = Array.isArray(req.body.regNos) ? new Set(req.body.regNos) : null;
    const year = (f.examYear.match(/\d{4}/) || [String(new Date().getFullYear())])[0];

    const issued = {};
    let skipped = 0;

    for (const c of data.candidates) {
      if (wanted && !wanted.has(c.regNo)) continue;
      if (c.hallTicketNo) {
        issued[c.regNo] = c.hallTicketNo; // already issued, keep the same number
        continue;
      }
      // skip only when there is nothing to write: no regular, arrear or practical paper
      if (c.papersCount === 0 && c.arrearPapers.length === 0 && c.practicalPapers.length === 0) {
        skipped += 1;
        continue;
      }

      // ADAPT: number format. Now: <year><5-digit running number>
      const counter = await Counter.findOneAndUpdate(
        { key: `HT-${year}` },
        { $inc: { seq: 1 } },
        { upsert: true, new: true }
      );
      const hallTicketNo = `${year}${String(counter.seq).padStart(5, '0')}`;

      await HallTicket.create({
        ...f,
        regNo: c.regNo,
        hallTicketNo,
        issuedBy: String(req.admin?._id || ''),
      });
      issued[c.regNo] = hallTicketNo;
    }

    res.json({ success: true, data: { issued, skipped } });
  } catch (err) {
    fail(res, 500, err.message);
  }
};
const mongoose = require('mongoose');
const AttendanceSheet = require('../models/Attendancesheet');
const AttendanceEntry = require('../models/Attendanceentry');
const Curriculum = require('../models/Curriculum')
const Student = require('../models/Student');
const Course = require('../models/Course');

const SUBJECT_TYPES = ['Theory', 'Practical', 'Internal'];
const SHEET_FIELDS = ['instCode', 'course', 'batch', 'semester', 'subCode', 'subjectType', 'examYear', 'studentCategory'];

/* ---------- batch lock ----------
 * "Verify & lock" on the page locks ALL marks of a batch in one exam year: every semester,
 * subject, sheet type and student category. The lock is one record per
 * institution + course + batch + exam year (model MarksLock, also used by routes/marksLock.js,
 * which has the Verify / Unlock routes). While it is on:
 *   - every sheet is returned as VERIFIED, including sheets opened for the first time
 *   - saving a row, changing the title add-on and unlocking a single sheet are refused
 */
const MarksLock =
  mongoose.models.MarksLock ||
  mongoose.model(
    'MarksLock',
    new mongoose.Schema(
      {
        instCode: { type: String, required: true, trim: true },
        course: { type: String, required: true, trim: true },
        batch: { type: String, required: true, trim: true },
        examYear: { type: String, required: true, trim: true },
        locked: { type: Boolean, default: false },
        lockedOn: { type: Date, default: null },
        lockedBy: { type: String, default: '' },
        unlockedOn: { type: Date, default: null },
        unlockedBy: { type: String, default: '' }
      },
      { timestamps: true }
    ).index({ instCode: 1, course: 1, batch: 1, examYear: 1 }, { unique: true })
  );

// is the batch of this sheet (or sheet key) verified and locked?
async function batchLocked(s) {
  const lock = await MarksLock.findOne({
    instCode: s.instCode,
    course: s.course,
    batch: s.batch,
    examYear: s.examYear
  })
    .select('locked')
    .lean();
  return Boolean(lock?.locked);
}

const LOCKED_MESSAGE = 'Marks of this batch are verified and locked. Unlock them to edit.';

/* ---------- helpers ---------- */

// matches "3", "03", "III", "Semester 3", "semester III" (case-insensitive)
const ROMANS = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
function semesterMatch(sem) {
  const raw = String(sem ?? '').trim().replace(/^semester\s*/i, '');
  const n = /^\d+$/.test(raw) ? Number(raw) : ROMANS.indexOf(raw.toUpperCase());
  if (!n || n < 1 || n >= ROMANS.length) return sem; // fall back to the exact value
  return { $regex: new RegExp(`^\\s*(semester\\s*)?0*(${n}|${ROMANS[n]})\\s*$`, 'i') };
}

// The entry field that holds the MARK of each sheet type. Theory, Practical and Internal marks of the
// same student and subject are therefore stored separately and never overwrite each other.
//   Internal  -> internalMark            (existing field, existing data stays valid)
//   Theory    -> theoryInternalMark      (NEW field)
//   Practical -> practicalInternalMark   (NEW field)
const markFieldOf = (subjectType) =>
  subjectType === 'Practical' ? 'practicalInternalMark'
    : subjectType === 'Theory' ? 'theoryInternalMark'
      : 'internalMark';

const presentFieldOf = (subjectType) => (subjectType === 'Practical' ? 'practicalPresent' : 'theoryPresent');

/* ---------- attendance: separate for Theory and Practical ----------
 *   Theory sheet    -> theoryAttendance
 *   Practical sheet -> practicalAttendance
 *   attendance      -> the subject as a whole = average of the theory and practical attendance
 *                      that are entered. It is recalculated on every save, and it is the figure
 *                      the nominal roll, hall ticket, dashboard and reports use.
 *   Internal sheet  -> shows `attendance`. It can be typed there only while the subject has no
 *                      theory / practical attendance (then it is simply the subject's attendance).
 */
const blank = (v) => v === null || v === undefined;
const attendanceFieldOf = (subjectType) =>
  subjectType === 'Practical' ? 'practicalAttendance' : subjectType === 'Theory' ? 'theoryAttendance' : 'attendance';
const hasSeparateAttendance = (e) => !blank(e?.theoryAttendance) || !blank(e?.practicalAttendance);

// the attendance a sheet shows for one entry
const sheetAttendance = (e, subjectType) => {
  if (!e) return null;
  if (subjectType === 'Internal') return e.attendance ?? null;
  const own = e[attendanceFieldOf(subjectType)];
  if (!blank(own)) return own;
  // an entry from before theory and practical were separated has one shared value: show it
  return hasSeparateAttendance(e) ? null : e.attendance ?? null;
};

const overallAttendance = (theory, practical) => {
  const values = [theory, practical].filter((v) => !blank(v));
  return values.length ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100 : null;
};

function readSheetKey(q) {
  const key = {};
  for (const f of SHEET_FIELDS) {
    const v = String(q[f] ?? '').trim();
    if (!v) return { error: `${f} is required` };
    key[f] = v;
  }
  if (!SUBJECT_TYPES.includes(key.subjectType)) return { error: 'Invalid subject type' };
  return { key };
}

const entryKeyOf = (s) => ({
  instCode: s.instCode,
  course: s.course,
  batch: s.batch,
  semester: s.semester,
  subCode: s.subCode,
  examYear: s.examYear,
  studentCategory: s.studentCategory
});

// "equal", ignoring upper / lower case and spaces at the ends
// (so a student saved as "Regular" or "2021 " is not silently left off the sheet)
const escapeRe = (v) => String(v).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const same = (v) => new RegExp(`^\\s*${escapeRe(String(v ?? '').trim())}\\s*$`, 'i');
const eq = (a, b) => String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase();

// the course may be stored on the student as its code or as its name
async function courseNames(instCode, course) {
  const doc = await Course.findOne({
    instCode: same(instCode),
    $or: [{ courseCode: same(course) }, { courseName: same(course) }]
  }).lean();
  return [...new Set([course, doc?.courseCode, doc?.courseName].filter(Boolean))];
}

// Students matching the selected filters.
// Student model: code = inst code, mode = student category (REGULAR / PART TIME / LATERAL ENTRY)
// Returns the students of the sheet, and the students of the same course + batch that are NOT on
// it with the reason (another category, inactive, another institution code), so a "missing"
// student can be explained on the page.
async function findStudents({ instCode, course, batch, studentCategory }) {
  const names = await courseNames(instCode, course);
  const all = await Student.find({
    course: { $in: names.map(same) },
    batch: same(batch)
  })
    .sort({ registerNo: 1 })
    .lean();

  const list = [];
  const notListed = [];
  all.forEach((s) => {
    const reasons = [];
    if (!eq(s.code, instCode)) reasons.push(`institution code is ${s.code || 'blank'}`);
    if (!eq(s.mode, studentCategory)) reasons.push(`student category is ${s.mode || 'blank'}`);
    if (s.status !== 'Active') reasons.push(`status is ${s.status || 'blank'}`);
    if (reasons.length) notListed.push({ regNo: s.registerNo, studentName: s.studentName, reason: reasons.join(', ') });
    else list.push({ regNo: s.registerNo, studentName: s.studentName });
  });
  list.notListed = notListed;
  return list;
}

const hasValue = (e) =>
  [e.attendance, e.theoryAttendance, e.practicalAttendance, e.internalMark, e.theoryInternalMark, e.practicalInternalMark]
    .some((v) => v !== null && v !== undefined);

const isPracticalRecord = (r) => /practical|clinical/i.test(r.component || '');

// Subject info + min/max that apply to the selected subject type
//   minMark / maxMark   : the paper's own range (as before)
//   markMin / markMax   : the range of the MARK column for this sheet type
//        Theory    -> internal min / max of the Theory record
//        Practical -> practical IA min / max of the Practical record (internal min / max if not set)
//        Internal  -> internal min / max
async function findSubject(sheet) {
  const list = await Curriculum.find({
    instCode: sheet.instCode,
    course: sheet.course,
    semester: semesterMatch(sheet.semester),
    subCodeP1: sheet.subCode
  }).lean();
  if (!list.length) return null;

  // Theory and Practical of the same sub code are separate records: use the one for this sheet type
  const wantPractical = sheet.subjectType === 'Practical';
  const c =
    list.find((r) => (sheet.subjectType === 'Internal' ? !isPracticalRecord(r) : isPracticalRecord(r) === wantPractical)) ||
    list[0];

  let min;
  let max;
  if (sheet.subjectType === 'Internal') {
    min = c.internalMinMark;
    max = c.internalMaxMark;
  } else if (sheet.subjectType === 'Practical' && Number(c.practicalIaMax) > 0) {
    min = c.practicalIaMin;
    max = c.practicalIaMax;
  } else {
    min = c.externalMinMark;
    max = c.externalMaxMark;
  }

  let markMin;
  let markMax;
  if (sheet.subjectType === 'Practical' && Number(c.practicalIaMax) > 0) {
    markMin = c.practicalIaMin;
    markMax = c.practicalIaMax;
  } else {
    markMin = c.internalMinMark;
    markMax = c.internalMaxMark;
  }

  return {
    subNameP1: c.subNameP1,
    subjectCategory: c.subjectCategory,
    component: c.component,
    minMark: Number(min) || 0,
    maxMark: Number(max) || 0,
    markMin: Number(markMin) || 0,
    markMax: Number(markMax) || 0
  };
}

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/* ---------- handlers ---------- */

// GET /api/attendance-marks/batches?instCode=&course=
exports.getBatches = async (req, res) => {
  try {
    const { instCode = '', course = '' } = req.query;
    const batches = await Student.distinct('batch', { code: instCode, course, status: 'Active' });
    res.status(200).json({ items: batches.filter(Boolean).map(String).sort() });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/attendance-marks/sheet?instCode=&course=&batch=&semester=&subCode=&subjectType=&examYear=&studentCategory=
// Loads (or creates) the sheet and merges it with the student list
exports.getSheet = async (req, res) => {
  try {
    const { key, error } = readSheetKey(req.query);
    if (error) return res.status(400).json({ message: error });

    // a sheet opened for the first time in a locked batch is created as VERIFIED
    const locked = await batchLocked(key);

    let sheet;
    try {
      sheet = await AttendanceSheet.findOneAndUpdate(
        key,
        { $setOnInsert: { status: locked ? 'VERIFIED' : 'DRAFT', titleAddon: '', ...(locked ? { verifiedAt: new Date() } : {}) } },
        { new: true, upsert: true }
      );
    } catch (e) {
      if (e.code === 11000) sheet = await AttendanceSheet.findOne(key);
      else throw e;
    }

    // keep the sheet in step with the batch lock
    if (locked && sheet.status !== 'VERIFIED') {
      sheet.status = 'VERIFIED';
      sheet.verifiedAt = new Date();
      await sheet.save();
    }

    const [students, subject] = await Promise.all([findStudents(key), findSubject(sheet)]);
    const entries = await AttendanceEntry.find(entryKeyOf(sheet)).lean();
    const byReg = new Map(entries.map((e) => [e.regNo, e]));
    const presentField = presentFieldOf(sheet.subjectType);
    const markField = markFieldOf(sheet.subjectType);

    // A student who already has attendance or marks saved on this subject stays on the sheet even
    // if the student record no longer matches the filters (category changed, made inactive ...),
    // so saved marks never disappear. The reason is shown next to the name.
    let notListed = students.notListed;
    const listed = new Set(students.map((s) => s.regNo));
    const kept = [];
    notListed = notListed.filter((s) => {
      const e = byReg.get(s.regNo);
      if (!e || !hasValue(e)) return true;
      kept.push({ regNo: s.regNo, studentName: s.studentName, note: s.reason });
      listed.add(s.regNo);
      return false;
    });
    // entries of a register number that is not in this course + batch at all
    const strays = entries.filter((e) => !listed.has(e.regNo) && hasValue(e));
    if (strays.length) {
      const docs = await Student.find({ registerNo: { $in: strays.map((e) => e.regNo) } }).lean();
      const byNo = new Map(docs.map((d) => [d.registerNo, d]));
      strays.forEach((e) => {
        const d = byNo.get(e.regNo);
        kept.push({
          regNo: e.regNo,
          studentName: d?.studentName || '—',
          note: d ? `now in batch ${d.batch}, ${d.course}` : 'not in the student master'
        });
      });
    }

    const rows = [...students, ...kept]
      .sort((a, b) => String(a.regNo).localeCompare(String(b.regNo), undefined, { numeric: true }))
      .map((s) => {
        const e = byReg.get(s.regNo) || {};
        return {
          regNo: s.regNo,
          studentName: s.studentName,
          note: s.note || '',                      // why the row is shown although the record differs
          attendance: sheetAttendance(e, sheet.subjectType), // the attendance of THIS sheet type
          // Internal sheet: true when the figure is the average of the Theory and Practical sheets
          attendanceCalculated: sheet.subjectType === 'Internal' && hasSeparateAttendance(e),
          present: e[presentField] ?? true,
          mark: e[markField] ?? null,            // the mark of THIS sheet type (Theory / Practical / Internal)
          internalMark: e.internalMark ?? null
        };
      });

    // notListed: students of this course + batch that are not on the sheet, each with the reason
    res.status(200).json({ sheet, subject, rows, batchLocked: locked, notListed });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// PUT /api/attendance-marks/sheet/:id   { titleAddon }
exports.updateSheet = async (req, res) => {
  try {
    const sheet = await AttendanceSheet.findById(req.params.id);
    if (!sheet) return res.status(404).json({ message: 'Sheet not found' });
    if (await batchLocked(sheet)) return res.status(423).json({ message: LOCKED_MESSAGE });
    if (sheet.status === 'VERIFIED') return res.status(423).json({ message: 'Sheet is verified and locked' });

    if (typeof req.body.titleAddon === 'string') sheet.titleAddon = req.body.titleAddon.trim();
    await sheet.save();
    res.status(200).json(sheet);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// PUT /api/attendance-marks/sheet/:id/entries/:regNo   { attendance, present, mark }
// Autosave for a single student row. The mark is stored in the field of the sheet's subject type.
exports.saveEntry = async (req, res) => {
  try {
    const sheet = await AttendanceSheet.findById(req.params.id);
    if (!sheet) return res.status(404).json({ message: 'Sheet not found' });
    if (await batchLocked(sheet)) return res.status(423).json({ message: LOCKED_MESSAGE });
    if (sheet.status === 'VERIFIED') return res.status(423).json({ message: 'Sheet is verified and locked' });

    const { attendance, present, internalMark } = req.body;
    // "mark" is the new field; "internalMark" is still accepted for Internal sheets
    const mark = req.body.mark !== undefined ? req.body.mark : (sheet.subjectType === 'Internal' ? internalMark : undefined);
    const markField = markFieldOf(sheet.subjectType);
    const set = {};

    if (attendance !== undefined) {
      if (attendance !== null && (!isNum(attendance) || attendance < 0 || attendance > 100)) {
        return res.status(400).json({ message: 'Attendance must be between 0 and 100' });
      }
      const current = (await AttendanceEntry.findOne({ ...entryKeyOf(sheet), regNo: req.params.regNo }).lean()) || {};

      if (sheet.subjectType === 'Internal') {
        // once theory / practical attendance exists, the subject's attendance is their average
        if (!hasSeparateAttendance(current)) set.attendance = attendance;
      } else {
        let theory = current.theoryAttendance ?? null;
        let practical = current.practicalAttendance ?? null;

        // An entry saved before theory and practical were separated has ONE shared value.
        // The first separate save keeps that value for the other sheet (when the subject has one),
        // so nothing that was entered is lost.
        if (blank(theory) && blank(practical) && !blank(current.attendance)) {
          const records = await Curriculum.find({
            instCode: sheet.instCode,
            course: sheet.course,
            semester: semesterMatch(sheet.semester),
            subCodeP1: sheet.subCode
          }).select('component').lean();
          const hasPractical = records.some(isPracticalRecord);
          const hasTheory = records.some((r) => !isPracticalRecord(r));
          if (sheet.subjectType === 'Theory' && hasPractical) practical = current.attendance;
          if (sheet.subjectType === 'Practical' && hasTheory) theory = current.attendance;
        }

        if (sheet.subjectType === 'Theory') theory = attendance;
        else practical = attendance;

        set.theoryAttendance = theory;
        set.practicalAttendance = practical;
        set.attendance = overallAttendance(theory, practical); // the subject as a whole
      }
    }

    if (mark !== undefined) {
      if (mark !== null) {
        const subject = await findSubject(sheet);
        const max = subject?.markMax || 0;
        if (!isNum(mark) || mark < 0 || (max > 0 && mark > max)) {
          return res.status(400).json({ message: `${sheet.subjectType} mark must be between 0 and ${max || 'max'}` });
        }
      }
      set[markField] = mark;
    }

    if (sheet.subjectType !== 'Internal' && present !== undefined) {
      set[presentFieldOf(sheet.subjectType)] = Boolean(present);
    }

    if (!Object.keys(set).length) return res.status(400).json({ message: 'Nothing to save' });

    const entry = await AttendanceEntry.findOneAndUpdate(
      { ...entryKeyOf(sheet), regNo: req.params.regNo },
      { $set: set },
      // strict:false lets theoryInternalMark / practicalInternalMark be saved even if the entry
      // model has not been given those two fields yet (otherwise Mongoose drops them silently,
      // and the mark seems to "not save" or to fall back to the shared value)
      { new: true, upsert: true, setDefaultsOnInsert: true, strict: false }
    );

    const saved = entry.toObject();
    res.status(200).json({
      regNo: entry.regNo,
      attendance: sheetAttendance(saved, sheet.subjectType), // of this sheet type
      subjectAttendance: saved.attendance ?? null,           // the subject as a whole
      mark: entry.get(markField) ?? entry[markField] ?? null,
      internalMark: entry.internalMark
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// POST /api/attendance-marks/sheet/:id/verify   { titleAddon? }
// Verifies ONE sheet. The page no longer uses it (it locks the whole batch through
// /api/marks-lock/verify), but it is kept so nothing that calls it breaks.
exports.verifySheet = async (req, res) => {
  try {
    const sheet = await AttendanceSheet.findById(req.params.id);
    if (!sheet) return res.status(404).json({ message: 'Sheet not found' });
    if (sheet.status === 'VERIFIED') return res.status(400).json({ message: 'Sheet is already verified' });

    const students = await findStudents(sheet);
    if (!students.length) return res.status(400).json({ message: 'No students on this sheet' });

    const entries = await AttendanceEntry.find({
      ...entryKeyOf(sheet),
      regNo: { $in: students.map((s) => s.regNo) }
    }).lean();
    const byReg = new Map(entries.map((e) => [e.regNo, e]));
    const markField = markFieldOf(sheet.subjectType);

    // attendance AND the mark of this sheet type are required for every student
    const missing = students.filter((s) => {
      const e = byReg.get(s.regNo);
      if (!e || sheetAttendance(e, sheet.subjectType) == null) return true;
      return e[markField] == null;
    });

    if (missing.length) {
      const list = missing.slice(0, 5).map((s) => s.regNo).join(', ');
      return res.status(400).json({
        message: `${missing.length} student(s) have missing values: ${list}${missing.length > 5 ? '…' : ''}`
      });
    }

    if (typeof req.body?.titleAddon === 'string') sheet.titleAddon = req.body.titleAddon.trim();
    sheet.status = 'VERIFIED';
    sheet.verifiedAt = new Date();
    await sheet.save();
    res.status(200).json(sheet);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// POST /api/attendance-marks/sheet/:id/unlock   (restrict to admin roles in your auth layer)
// Unlocks ONE sheet. Refused while the whole batch is locked: unlock the batch instead.
exports.unlockSheet = async (req, res) => {
  try {
    const sheet = await AttendanceSheet.findById(req.params.id);
    if (!sheet) return res.status(404).json({ message: 'Sheet not found' });
    if (await batchLocked(sheet)) return res.status(423).json({ message: LOCKED_MESSAGE });
    sheet.status = 'DRAFT';
    sheet.verifiedAt = undefined;
    await sheet.save();
    res.status(200).json(sheet);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
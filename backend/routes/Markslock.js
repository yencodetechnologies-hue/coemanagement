/**
 * Marks lock: ONE verify / unlock for all the attendance and internal marks of a batch in an
 * exam session (every semester, every subject, every sheet type, every student category).
 *
 * This file has the Verify / Unlock routes. The attendance marks controller enforces the lock
 * (it refuses edits and returns every sheet of a locked batch as VERIFIED).
 *
 * In server.js, anywhere among the routes:
 *
 *   app.use('/api/marks-lock', require('./routes/marksLock'));
 */
const express = require('express');
const mongoose = require('mongoose');
const { Schema } = mongoose;

/* ------------------------------ model ------------------------------ */
// the same model is declared in the attendance marks controller; whichever file loads first registers it
const marksLockSchema = new Schema(
  {
    instCode: { type: String, required: true, trim: true },
    course: { type: String, required: true, trim: true },
    batch: { type: String, required: true, trim: true },
    examYear: { type: String, required: true, trim: true },

    locked: { type: Boolean, default: false },
    lockedOn: { type: Date, default: null },
    lockedBy: { type: String, default: '' },
    unlockedOn: { type: Date, default: null },
    unlockedBy: { type: String, default: '' },
  },
  { timestamps: true }
);
marksLockSchema.index({ instCode: 1, course: 1, batch: 1, examYear: 1 }, { unique: true });
const MarksLock = mongoose.models.MarksLock || mongoose.model('MarksLock', marksLockSchema);

/* ------------------------------ helpers ------------------------------ */
const KEYS = ['instCode', 'course', 'batch', 'examYear'];
const ok = (res, data) => res.json({ success: true, data });
const fail = (res, code, message) => res.status(code).json({ success: false, message });

// the four values that identify a lock, or null when one is missing
const scopeOf = (src) => {
  if (!src || typeof src !== 'object') return null;
  const scope = {};
  for (const k of KEYS) {
    const v = String(src[k] ?? '').trim();
    if (!v) return null;
    scope[k] = v;
  }
  return scope;
};

const present = (lock) => ({
  locked: Boolean(lock?.locked),
  lockedOn: lock?.locked ? lock.lockedOn : null,
  lockedBy: lock?.locked ? lock.lockedBy : '',
});

// the staff selected in the header (the audit logger puts it on req.admin)
const staffName = (req) => req.admin?.fullName || '';

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
// "3" / "III" / "Semester III" -> 3
const termOf = (sem) => {
  const raw = String(sem ?? '').trim().replace(/^semester\s*/i, '');
  if (/^\d+$/.test(raw)) return Number(raw);
  const i = ROMAN.indexOf(raw.toUpperCase());
  return i > 0 ? i : 0;
};
const natural = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true });
const blank = (v) => v === null || v === undefined;

/**
 * What the lock covers, and what is still missing (shown before locking, as a warning).
 * A student counts as missing for a subject when there is no attendance, or no mark at all
 * (Theory, Practical and Internal mark are all empty). Subjects of a semester that has entries
 * but were never opened are listed as well.
 */
const summary = async (scope) => {
  const Entry = mongoose.models.AttendanceEntry;
  const Student = mongoose.models.Student;
  const Curriculum = mongoose.models.Curriculum;
  if (!Entry) return { students: 0, subjects: 0, incomplete: [] };

  const [entries, studentDocs, curriculum] = await Promise.all([
    Entry.find(scope)
      .select('regNo semester subCode attendance internalMark theoryInternalMark practicalInternalMark')
      .lean(),
    Student
      ? Student.find({ code: scope.instCode, course: scope.course, batch: scope.batch, status: 'Active' })
          .select('registerNo')
          .lean()
      : [],
    Curriculum
      ? Curriculum.find({ instCode: scope.instCode, course: scope.course, status: 'Active' })
          .select('semester subCodeP1')
          .lean()
      : [],
  ]);

  const groups = new Map(); // term|subject -> { term, subCode, byReg }
  entries.forEach((e) => {
    const term = termOf(e.semester);
    const key = `${term}|${e.subCode}`;
    if (!groups.has(key)) groups.set(key, { term, subCode: e.subCode, byReg: new Map() });
    groups.get(key).byReg.set(e.regNo, e);
  });
  const terms = new Set([...groups.values()].map((g) => g.term));

  // subjects of those semesters that have no entry at all yet
  curriculum.forEach((c) => {
    const term = termOf(c.semester);
    const key = `${term}|${c.subCodeP1}`;
    if (terms.has(term) && !groups.has(key)) groups.set(key, { term, subCode: c.subCodeP1, byReg: new Map() });
  });

  const roll = studentDocs.length
    ? studentDocs.map((s) => s.registerNo)
    : [...new Set(entries.map((e) => e.regNo))];

  const incomplete = [];
  groups.forEach((g) => {
    const missing = roll.filter((regNo) => {
      const e = g.byReg.get(regNo);
      if (!e || blank(e.attendance)) return true;
      return blank(e.internalMark) && blank(e.theoryInternalMark) && blank(e.practicalInternalMark);
    }).length;
    if (missing) incomplete.push({ term: g.term, semester: ROMAN[g.term] || String(g.term), subCode: g.subCode, missing, total: roll.length });
  });
  incomplete.sort((a, b) => a.term - b.term || natural(a.subCode, b.subCode));

  return {
    students: roll.length,
    subjects: groups.size,
    semesters: [...terms].sort((a, b) => a - b).map((t) => ROMAN[t] || String(t)),
    incomplete,
  };
};

// every sheet of the batch follows the lock
const setSheets = async (scope, locked) => {
  const Sheet = mongoose.models.AttendanceSheet;
  if (!Sheet) return 0;
  const r = await Sheet.updateMany(
    scope,
    locked
      ? { $set: { status: 'VERIFIED', verifiedAt: new Date() } }
      : { $set: { status: 'DRAFT' }, $unset: { verifiedAt: '' } }
  );
  return r.modifiedCount ?? r.nModified ?? 0;
};

/* ------------------------------ routes ------------------------------ */
const router = express.Router();

// GET /api/marks-lock?instCode=&course=&batch=&examYear=        -> { locked, lockedOn, lockedBy }
// GET /api/marks-lock?...&check=1                               -> also what is covered / missing
router.get('/', async (req, res) => {
  try {
    const scope = scopeOf(req.query);
    if (!scope) return fail(res, 400, 'instCode, course, batch and examYear are required');
    const state = present(await MarksLock.findOne(scope).lean());
    ok(res, req.query.check ? { ...state, ...(await summary(scope)) } : state);
  } catch (err) {
    fail(res, 500, err.message);
  }
});

// POST /api/marks-lock/verify     body: { instCode, course, batch, examYear }
router.post('/verify', async (req, res) => {
  try {
    const scope = scopeOf(req.body);
    if (!scope) return fail(res, 400, 'instCode, course, batch and examYear are required');
    const lock = await MarksLock.findOneAndUpdate(
      scope,
      { $set: { locked: true, lockedOn: new Date(), lockedBy: staffName(req) } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();
    await setSheets(scope, true); // every sheet of the batch becomes VERIFIED
    const { students, subjects, semesters } = await summary(scope);
    ok(res, { ...present(lock), students, subjects, semesters });
  } catch (err) {
    fail(res, 500, err.message);
  }
});

// POST /api/marks-lock/withdraw   body: { instCode, course, batch, examYear }   (= unlock)
router.post('/withdraw', async (req, res) => {
  try {
    const scope = scopeOf(req.body);
    if (!scope) return fail(res, 400, 'instCode, course, batch and examYear are required');
    const lock = await MarksLock.findOneAndUpdate(
      scope,
      { $set: { locked: false, unlockedOn: new Date(), unlockedBy: staffName(req) } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();
    await setSheets(scope, false); // every sheet of the batch is editable again
    ok(res, present(lock));
  } catch (err) {
    fail(res, 500, err.message);
  }
});

/* ------------------------------ guard (optional) ------------------------------ *
 * The attendance marks controller already refuses edits of a locked batch, so this is not needed
 * any more. It is kept so an existing  app.use('/api/attendance-marks', marksLock.guard)  line
 * in server.js keeps working.
 *
 * Refuses a change to the attendance / internal marks while they are locked, so a locked batch
 * cannot be edited even from another browser tab that was opened before the lock.
 * The batch of a request is read from what it sends, or from the sheet whose id is in the address.
 */
const CHANGING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const recordOf = async (id) => {
  const names = mongoose.modelNames().filter((n) => n !== 'AuditLog' && n !== 'MarksLock');
  const found = await Promise.all(
    names.map((n) => mongoose.model(n).findById(id).lean().catch(() => null))
  );
  return found.find((doc) => doc && scopeOf(doc)) || null;
};

router.guard = async function marksLockGuard(req, res, next) {
  if (!CHANGING.has(req.method)) return next();
  try {
    let scope = scopeOf(req.body) || scopeOf(req.query);
    if (!scope) {
      const id = (String(req.originalUrl || req.url).split('?')[0].match(/[a-f0-9]{24}/i) || [])[0];
      if (id) scope = scopeOf(await recordOf(id));
    }
    if (!scope) return next();
    const lock = await MarksLock.findOne(scope).select('locked').lean();
    if (lock?.locked) {
      return fail(res, 423, `Marks of batch ${scope.batch} (${scope.examYear}) are verified and locked. Unlock them to edit.`);
    }
    return next();
  } catch (err) {
    return next(); // never block the page because the check itself failed
  }
};

module.exports = router;
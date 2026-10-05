const crypto = require('crypto');
const Course = require('../models/Course');
const Curriculum = require('../models/Curriculum');
const AttendanceEntry = require('../models/Attendanceentry');
const Student = require('../models/Student');
const BarcodeMapping = require('../models/Barcodemapping');
const Rebundle = require('../models/Rebundle');
const TheoryTimeTable = require('../models/TheoryTimeTable');

const ok = (res, data, code = 200) => res.status(code).json({ success: true, data });
const fail = (res, code, message) => res.status(code).json({ success: false, message });
const serverError = (res, err) =>
  err.name === 'CastError' ? fail(res, 400, 'Invalid id') : fail(res, 500, err.message || 'Server error');

/* ------------------------------------------------------------------ *
 * Field names of your EXISTING models. If a name differs, change it
 * here (these are the only places that read Curriculum / Course fields).
 * ------------------------------------------------------------------ */
const cur = {
  code1: (c) => c.subCodeP1,
  name1: (c) => c.subNameP1 || '',
  code2: (c) => c.subCodeP2 || '',
  name2: (c) => c.subNameP2 || '',
  type: (c) => (/practical|clinical/i.test(c.component || c.subjectType || '') ? 'PRACTICAL' : 'THEORY'),
  category: (c) => c.subjectCategory || c.category || '',
};

const buildInfo = (course, curriculum) => ({
  instName: course?.instName || course?.collegeName || '',
  degree: course?.degree || course?.degreeType || '',
  courseMode: course?.courseMode || course?.mode || '',
  department: course?.department || '',
  regulation: course?.regulation || curriculum?.regulation || '',
  examPattern: course?.examPattern || '',
  category: curriculum ? cur.category(curriculum) : '',
});

/* ------------------------------------------------------------------ */

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

// AttendanceEntry / Curriculum may store the course as the course CODE or the course NAME.
// Resolve the Course document and return every spelling, so queries match either one.
// (Same approach as the application / hall ticket controller.)
const courseContext = async (instCode, course) => {
  const doc = await Course.findOne({
    instCode,
    $or: [{ courseCode: course }, { courseName: course }],
  }).lean();
  const keys = [...new Set([course, doc?.courseCode, doc?.courseName].filter(Boolean))];
  return { doc, keys };
};

// Date / session of the exam, read from the saved theory time table.
// Returns null when no time table is saved or the paper is not in it ("Not scheduled").
const findSchedule = async (f, subject, courseKeys) => {
  const term = semesterNumber(f.semester);
  const timetable = await TheoryTimeTable.findOne({
    instCode: f.instCode,
    course: { $in: courseKeys },
    examYear: f.examYear,
    $or: [
      ...(term ? [{ term }] : []),
      { semester: { $in: semesterVariants(f.semester) } },
    ],
  }).lean();
  if (!timetable) return null;

  const codes = [cur.code1(subject), cur.code2(subject)].filter(Boolean);
  const matches = (timetable.entries || []).filter((e) => codes.includes(e.subCode));
  // a subject code can have a Theory and a Practical entry: take the one of this paper's type;
  // older entries without a component are used as they are
  const wantPractical = cur.type(subject) === 'PRACTICAL';
  const entry =
    matches.find((e) => e.component && /practical|clinical/i.test(e.component) === wantPractical) ||
    matches.find((e) => !e.component) ||
    (matches.length === 1 ? matches[0] : null);
  if (!entry) return null;

  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(entry.examDate || '');
  const day = m
    ? new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString('en-IN', { weekday: 'long' })
    : '';

  return {
    examDate: entry.examDate, // yyyy-mm-dd
    date: entry.examDate,     // same value, alternate key for the frontend
    day,
    session: entry.session,   // FN / AN
    conductedBy: entry.conductedBy || '',
  };
};

const natural = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true });

// absent candidates are skipped (theory / practical presence of the attendance entry)
const isPresent = (entry, type) => {
  const v = type === 'PRACTICAL' ? entry.practicalPresent : entry.theoryPresent;
  if (v === undefined || v === null || v === '') return true;
  if (typeof v === 'boolean') return v;
  return !/^(a|ab|absent|false|no|0)$/i.test(String(v).trim());
};

const FILTER_KEYS = ['instCode', 'course', 'batch', 'semester', 'examYear', 'subCode'];

// The subject dropdown sends "CODE::THEORY" or "CODE::PRACTICAL", because one subject code can
// have a theory paper and a practical paper. A plain code (old links) means the theory paper.
const pickFilter = (src) => {
  const f = {};
  FILTER_KEYS.forEach((k) => {
    f[k] = String(src[k] ?? '').trim();
  });
  const m = /^(.*)::(THEORY|PRACTICAL)$/i.exec(f.subCode);
  f.subjectType = m ? m[2].toUpperCase() : '';
  if (m) f.subCode = m[1];
  return f;
};
const missingKeys = (f) => FILTER_KEYS.filter((k) => !f[k]);

// one mapping per paper = subject code + type
const mappingKey = (f, type) => ({
  instCode: f.instCode, course: f.course, batch: f.batch, semester: f.semester,
  examYear: f.examYear, subCode: f.subCode, subjectType: type,
});

// the curriculum row of the chosen paper (theory row when no type is given)
const findSubject = async (f, courseKeys) => {
  const rows = await Curriculum.find({
    instCode: f.instCode,
    course: { $in: courseKeys },
    semester: { $in: semesterVariants(f.semester) },
    subCodeP1: f.subCode,
  }).lean();
  const wanted = f.subjectType || (rows.some((c) => cur.type(c) === 'THEORY') ? 'THEORY' : 'PRACTICAL');
  const typed = rows.filter((c) => cur.type(c) === wanted);
  if (!typed.length) return null;
  const score = (c) => (c.batch === f.batch ? 4 : !c.batch ? 2 : 0) + (c.status === 'Active' ? 1 : 0);
  return typed.sort((a, b) => score(b) - score(a))[0];
};

// The unique index of BarcodeMapping now includes the subject type. Mongoose does not remove
// the old index (code only) by itself, and it would block the practical mapping of a code that
// already has a theory mapping, so the indexes are brought in line once.
let indexesReady = null;
const ensureIndexes = () => {
  indexesReady =
    indexesReady ||
    BarcodeMapping.syncIndexes().catch((err) => console.error('Barcode index update failed:', err.message));
  return indexesReady;
};

const BARCODE_RE = /^[A-Za-z0-9-]{3,20}$/; // manually entered barcodes

// "equal", ignoring upper / lower case and spaces at the ends (same rule as the attendance sheet)
const escapeRe = (v) => String(v).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const same = (v) => new RegExp(`^\\s*${escapeRe(String(v ?? '').trim())}\\s*$`, 'i');

/**
 * The candidates of one paper, taken from the Attendance & internal marks module.
 *
 *   on the list : every ACTIVE student of the course + batch in the Student master, whatever the
 *                 student category (REGULAR, PART TIME, LATERAL ENTRY all write the same paper).
 *                 This is the same student list the attendance sheets show, so a student appears
 *                 here even when nothing has been typed for this subject yet.
 *                 A register number that is NOT in the Student master (the student was deleted,
 *                 or moved out of this course / batch) is never a candidate, even when old
 *                 attendance entries of that register number still exist.
 *   skipped     : a student marked NOT present on the exam day. Presence is separate for the
 *                 Theory and the Practical sheet (theoryPresent / practicalPresent), so a student
 *                 absent for the practical still gets a barcode for the theory paper.
 */
const getCandidates = async (f, type, codes, courseKeys) => {
  const [rows, students] = await Promise.all([
    AttendanceEntry.find({
      instCode: f.instCode,
      course: { $in: courseKeys },
      batch: f.batch,
      examYear: f.examYear,
      semester: { $in: semesterVariants(f.semester) },
      subCode: { $in: codes },
    })
      .select('regNo theoryPresent practicalPresent')
      .lean(),
    // every student of the course + batch; the institution code and status are checked below so
    // a student who is left out can be named with the reason
    Student.find({
      course: { $in: courseKeys.map(same) },
      batch: same(f.batch),
    })
      .select('registerNo studentName code status')
      .lean(),
  ]);

  const entered = new Set(rows.map((r) => r.regNo));
  const eq = (a, b) => String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase();
  const notListed = [];

  // present unless an entry of the paper says absent (a combined paper has two codes: present in either counts)
  const byReg = new Map();
  students.forEach((s) => {
    const reasons = [];
    if (!eq(s.code, f.instCode)) reasons.push(`institution code is ${s.code || 'blank'}`);
    if (s.status !== 'Active') reasons.push(`status is ${s.status || 'blank'}`);
    if (reasons.length && !entered.has(s.registerNo)) {
      notListed.push({ regNo: s.registerNo, studentName: s.studentName, reason: reasons.join(', ') });
      return;
    }
    byReg.set(s.registerNo, null); // on the sheet, nothing recorded yet
  });
  rows.forEach((r) => {
    if (!byReg.has(r.regNo)) return; // not in the Student master any more (deleted): not a candidate
    const present = isPresent(r, type);
    const before = byReg.get(r.regNo);
    byReg.set(r.regNo, before === null || before === undefined ? present : before || present);
  });

  const regNos = [...byReg.keys()].sort(natural);
  const present = regNos.filter((r) => byReg.get(r) !== false);
  const absentRegNos = regNos.filter((r) => byReg.get(r) === false);
  return { present, absent: absentRegNos.length, absentRegNos, notListed };
};

// register numbers of the list that no longer exist in the Student master at all (deleted students)
const deletedRegNos = async (regNos) => {
  if (!regNos.length) return [];
  const found = await Student.find({ registerNo: { $in: regNos } }).select('registerNo').lean();
  const alive = new Set(found.map((s) => s.registerNo));
  return regNos.filter((r) => !alive.has(r));
};

// takes register numbers out of a mapping, and their scripts out of the packets made from it
const removeFromMapping = async (mapping, regNos) => {
  const gone = new Set(regNos);
  const barcodes = mapping.entries.filter((e) => gone.has(e.regNo)).map((e) => e.barcode);
  await BarcodeMapping.updateOne({ _id: mapping._id }, { $pull: { entries: { regNo: { $in: regNos } } } });
  if (barcodes.length) {
    await Rebundle.updateOne({ mapping: mapping._id }, { $pull: { 'packets.$[].scripts': { barcode: { $in: barcodes } } } });
    await Rebundle.updateOne({ mapping: mapping._id }, { $pull: { packets: { scripts: { $size: 0 } } } }); // a packet left empty
  }
  return barcodes.length;
};

/**
 * A deleted student must not stay in the bar code mapping.
 *   - no external mark entered for the script -> removed automatically (from the mapping and
 *     from its packet); nothing of value is lost
 *   - a mark is already entered               -> kept and shown as "Student deleted", so a mark is
 *     never thrown away silently; "Remove deleted students" on the page removes it
 * Safety: when NONE of the mapped students exists any more, nothing is removed automatically
 * (that looks like a problem with the student data, not like one deleted student).
 */
const cleanDeleted = async (mapping) => {
  if (!mapping?.entries?.length) return { mapping, deleted: [] };
  const gone = await deletedRegNos(mapping.entries.map((e) => e.regNo));
  if (!gone.length) return { mapping, deleted: [] };
  if (gone.length === mapping.entries.length) return { mapping, deleted: gone };

  const rb = await Rebundle.findOne({ mapping: mapping._id }).select('packets.scripts').lean();
  const marked = new Set();
  rb?.packets.forEach((p) => p.scripts.forEach((s) => { if (s.mark !== null && s.mark !== undefined) marked.add(s.barcode); }));
  const barcodeOf = new Map(mapping.entries.map((e) => [e.regNo, e.barcode]));
  const removable = gone.filter((r) => !marked.has(barcodeOf.get(r)));
  if (removable.length) await removeFromMapping(mapping, removable);

  return {
    mapping: removable.length ? await BarcodeMapping.findById(mapping._id).lean() : mapping,
    deleted: gone.filter((r) => !removable.includes(r)), // still in the mapping: their mark is entered
    removed: removable,
  };
};

// random 6-digit barcodes, never repeated inside the same institution + exam year
const makeBarcodes = (count, used) => {
  const seen = new Set(used);
  if (900000 - seen.size < count) throw new Error('Not enough free barcode numbers');
  const out = [];
  while (out.length < count) {
    const b = String(crypto.randomInt(100000, 1000000));
    if (!seen.has(b)) {
      seen.add(b);
      out.push(b);
    }
  }
  return out;
};

const subjectContext = async (f) => {
  const { doc: course, keys: courseKeys } = await courseContext(f.instCode, f.course);
  const subject = await findSubject(f, courseKeys);
  if (!subject) return null;
  const type = cur.type(subject);
  const codes = [cur.code1(subject), cur.code2(subject)].filter(Boolean);
  return { subject, type, codes, course, courseKeys };
};

/* ------------------------------ handlers ------------------------------ */

// GET /api/barcode/options?instCode=&course=&batch=&semester=
// Option lists for the cascading filters.
exports.getOptions = async (req, res) => {
  try {
    const { instCode, course, batch, semester } = req.query;
    const out = { instCodes: [], courses: [], batches: [], semesters: [], examYears: [], subjects: [] };

    out.instCodes = (await Course.distinct('instCode')).filter(Boolean).sort(natural);

    if (instCode) {
      out.courses = await Course.find({ instCode }).select('courseCode courseName').sort({ courseCode: 1 }).lean();
    }

    if (instCode && course) {
      // match the course by code OR name (attendance entries may store either)
      const { keys: courseKeys } = await courseContext(instCode, course);
      const base = { instCode, course: { $in: courseKeys } };

      out.batches = (await AttendanceEntry.distinct('batch', base))
        .filter((b) => b !== null && b !== undefined && b !== '')
        .map(String)
        .sort(natural)
        .reverse();

      const withBatch = batch ? { ...base, batch } : base;
      out.semesters = (await AttendanceEntry.distinct('semester', withBatch))
        .map(String)
        .sort((a, b) => (semesterNumber(a) || 0) - (semesterNumber(b) || 0));

      if (semester) {
        const sem = { $in: semesterVariants(semester) };
        out.examYears = (await AttendanceEntry.distinct('examYear', { ...withBatch, semester: sem }))
          .map(String)
          .sort(natural)
          .reverse();

        const rows = await Curriculum.find({ instCode, course: { $in: courseKeys }, semester: sem }).lean();
        // one entry per subject code AND type, so the practical paper of a code is listed as well
        const seen = new Set();
        rows.forEach((c) => {
          const code = cur.code1(c);
          const type = cur.type(c);
          if (!code || seen.has(`${code}|${type}`)) return;
          seen.add(`${code}|${type}`);
          out.subjects.push({
            code,
            code2: cur.code2(c),
            name: cur.name1(c),
            name2: cur.name2(c),
            type,
            value: `${code}::${type}`, // what the dropdown sends back as subCode
            category: cur.category(c),
            label: `${code}${cur.code2(c) ? `-${cur.code2(c)}` : ''} (${type === 'PRACTICAL' ? 'Practical' : 'Theory'})`,
          });
        });
        out.subjects.sort((a, b) => natural(a.code, b.code) || (a.type === b.type ? 0 : a.type === 'THEORY' ? -1 : 1));
      }
    }

    ok(res, out);
  } catch (err) {
    serverError(res, err);
  }
};

// GET /api/barcode/mapping?instCode&course&batch&semester&examYear&subCode
exports.getMapping = async (req, res) => {
  try {
    const f = pickFilter(req.query);
    if (missingKeys(f).length) return fail(res, 400, `Missing: ${missingKeys(f).join(', ')}`);

    const ctx = await subjectContext(f);
    if (!ctx) return fail(res, 404, 'Subject not found in the curriculum');

    const { present, absent, absentRegNos, notListed } = await getCandidates(f, ctx.type, ctx.codes, ctx.courseKeys);
    // students deleted from the Student master leave the mapping (see cleanDeleted)
    const cleaned = await cleanDeleted(await BarcodeMapping.findOne(mappingKey(f, ctx.type)).lean());
    const mapping = cleaned.mapping;
    const deletedSet = new Set(cleaned.deleted);

    // packet number of every barcode (after Re-bundle)
    const packetOf = new Map();
    if (mapping) {
      const rb = await Rebundle.findOne({ mapping: mapping._id }).lean();
      rb?.packets.forEach((p) => p.scripts.forEach((s) => packetOf.set(s.barcode, p.packetNo)));
    }

    // EVERY student of the batch is listed, so the list always matches the attendance sheets:
    //   - a candidate with a barcode
    //   - a candidate with no barcode yet (joined the list after the barcodes were made)
    //   - a student marked absent for this paper            -> shown as Absent, gets no barcode
    //   - a student who is not a candidate (inactive ...)   -> shown with the reason, gets no barcode
    const mappedSet = new Set((mapping?.entries || []).map((e) => e.regNo));
    const presentSet = new Set(present);
    const absentSet = new Set(absentRegNos);
    const unmapped = mapping ? present.filter((r) => !mappedSet.has(r)) : [];
    const blankRow = (regNo, extra = {}) => ({
      regNo, barcode: '', packetNo: null, unmapped: false, noLongerCandidate: false, absent: false, excluded: '', deleted: false, ...extra,
    });
    const rows = [
      ...(mapping
        ? [
            ...mapping.entries.map((e) =>
              blankRow(e.regNo, {
                barcode: e.barcode,
                packetNo: packetOf.get(e.barcode) || null,
                noLongerCandidate: !presentSet.has(e.regNo), // mapped earlier, now absent or removed
                absent: absentSet.has(e.regNo),
                deleted: deletedSet.has(e.regNo), // student deleted, kept only because a mark is entered
              })
            ),
            ...unmapped.map((regNo) => blankRow(regNo, { unmapped: true })),
          ]
        : present.map((regNo) => blankRow(regNo))),
      ...absentRegNos.filter((r) => !mappedSet.has(r)).map((regNo) => blankRow(regNo, { absent: true })),
      ...notListed.filter((x) => !mappedSet.has(x.regNo)).map((x) => blankRow(x.regNo, { excluded: x.reason })),
    ].sort((a, b) => natural(a.regNo, b.regNo));

    const candidatesChanged =
      !!mapping && (present.length !== mappedSet.size || present.some((r) => !mappedSet.has(r)));

    ok(res, {
      subject: {
        code: cur.code1(ctx.subject),
        code2: cur.code2(ctx.subject),
        name: cur.name1(ctx.subject),
        name2: cur.name2(ctx.subject),
        type: ctx.type,
        value: `${cur.code1(ctx.subject)}::${ctx.type}`,
        category: cur.category(ctx.subject),
      },
      mode: mapping?.mode || 'AUTO', // AUTO = generated, MANUAL = typed / scanned in
      info: mapping?.info && Object.keys(mapping.info).length ? mapping.info : buildInfo(ctx.course, ctx.subject),
      schedule: await findSchedule(f, ctx.subject, ctx.courseKeys),
      mapped: !!mapping,
      mappingId: mapping?._id || null,
      status: mapping?.status || 'DRAFT',
      mappedOn: mapping?.mappedOn || null,
      verifiedOn: mapping?.verifiedOn || null,
      absentSkipped: absent,
      absentRegNos, // who was skipped (marked not present on the attendance sheet of this paper type)
      notListed,    // students of the batch that are not candidates, each with the reason
      mappedCount: mapping ? mapping.entries.length : 0,
      unmappedCount: unmapped.length,
      deletedCount: cleaned.deleted.length,          // deleted students still mapped (mark entered)
      removedDeleted: cleaned.removed || [],         // deleted students taken out just now
      candidateCount: present.length, // students who get a barcode (present for this paper)
      studentCount: rows.length,      // everyone listed
      candidatesChanged,
      rows,
    });
  } catch (err) {
    serverError(res, err);
  }
};

// POST /api/barcode/generate
//   body: the filters                         -> random barcodes (first time and "Regenerate barcodes")
//   body: the filters + entries: [{ regNo, barcode }]  -> barcodes entered by hand / scanner
exports.generate = async (req, res) => {
  try {
    const f = pickFilter(req.body);
    if (missingKeys(f).length) return fail(res, 400, `Missing: ${missingKeys(f).join(', ')}`);

    const ctx = await subjectContext(f);
    if (!ctx) return fail(res, 404, 'Subject not found in the curriculum');

    await ensureIndexes();
    const key = mappingKey(f, ctx.type);
    const existing = await BarcodeMapping.findOne(key).select('status entries').lean();

    const { present } = await getCandidates(f, ctx.type, ctx.codes, ctx.courseKeys);
    if (!present.length) return fail(res, 400, 'No present candidates found for this paper.');

    const used = await BarcodeMapping.distinct('entries.barcode', {
      instCode: f.instCode,
      examYear: f.examYear,
      ...(existing ? { _id: { $ne: existing._id } } : {}),
    });

    // ---- "Remove deleted students": also those whose script already has a mark ----
    if (req.body.removeDeleted && existing) {
      const gone = await deletedRegNos(existing.entries.map((e) => e.regNo));
      if (gone.length) await removeFromMapping(existing, gone);
      return ok(res, { mappingId: existing._id, removed: gone.length, scripts: existing.entries.length - gone.length });
    }

    // ---- "Add missing barcodes": candidates who joined the list after the barcodes were made ----
    // The existing barcodes and packets are not touched, so this is allowed on a verified mapping too.
    if (req.body.addMissing && existing) {
      const have = new Set(existing.entries.map((e) => e.regNo));
      const missing = present.filter((r) => !have.has(r));
      if (!missing.length) return ok(res, { mappingId: existing._id, added: 0, scripts: existing.entries.length });
      const fresh = makeBarcodes(missing.length, [...used, ...existing.entries.map((e) => e.barcode)]);
      const added = missing.map((regNo, i) => ({ regNo, barcode: fresh[i] }));
      await BarcodeMapping.updateOne({ _id: existing._id }, { $push: { entries: { $each: added } } });

      // the paper is already re-bundled: the new scripts join its last packet, so they can be
      // marked without re-bundling (existing packets, evaluators and marks are not touched)
      let packetNo = null;
      const rb = await Rebundle.findOne({ mapping: existing._id }).select('packets.packetNo').lean();
      if (rb?.packets?.length) {
        packetNo = Math.max(...rb.packets.map((p) => p.packetNo));
        const barcodes = added.map((a) => a.barcode);
        await Rebundle.updateOne(
          { _id: rb._id, 'packets.scripts.barcode': { $nin: barcodes } },
          { $push: { 'packets.$[p].scripts': { $each: barcodes.map((barcode) => ({ barcode, mark: null })) } } },
          { arrayFilters: [{ 'p.packetNo': packetNo }] }
        );
      }
      return ok(res, { mappingId: existing._id, added: added.length, scripts: existing.entries.length + added.length, packetNo }, 201);
    }

    if (existing?.status === 'VERIFIED') return fail(res, 409, 'This mapping is verified and locked.');

    const manual = Array.isArray(req.body.entries);
    let entries;

    if (manual) {
      // ---- barcodes typed or scanned in: every present candidate needs one, all different ----
      const given = new Map();
      for (const e of req.body.entries) {
        const regNo = String(e?.regNo ?? '').trim();
        const barcode = String(e?.barcode ?? '').trim();
        if (!regNo || !barcode) continue;
        if (!present.includes(regNo)) return fail(res, 400, `${regNo} is not a present candidate of this paper.`);
        if (!BARCODE_RE.test(barcode)) {
          return fail(res, 400, `Barcode "${barcode}" (${regNo}) is not valid. Use 3 to 20 letters or digits.`);
        }
        given.set(regNo, barcode);
      }
      const missing = present.filter((r) => !given.has(r));
      if (missing.length) {
        return fail(res, 400, `Enter a barcode for every candidate. Missing: ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? ` and ${missing.length - 5} more` : ''}.`);
      }
      const seen = new Map();
      for (const [regNo, barcode] of given) {
        if (seen.has(barcode)) return fail(res, 400, `Barcode ${barcode} is entered twice (${seen.get(barcode)} and ${regNo}).`);
        seen.set(barcode, regNo);
      }
      const usedSet = new Set(used);
      const clash = [...seen.keys()].filter((b) => usedSet.has(b));
      if (clash.length) {
        return fail(res, 409, `Already used in another paper of ${f.examYear}: ${clash.slice(0, 5).join(', ')}.`);
      }
      entries = present.map((regNo) => ({ regNo, barcode: given.get(regNo) }));
    } else {
      const barcodes = makeBarcodes(present.length, used);
      entries = present.map((regNo, i) => ({ regNo, barcode: barcodes[i] }));
    }

    // did any barcode actually change? (saving the same manual list again keeps the packets)
    const before = new Map((existing?.entries || []).map((e) => [e.regNo, e.barcode]));
    const changed = before.size !== entries.length || entries.some((e) => before.get(e.regNo) !== e.barcode);

    const mapping = await BarcodeMapping.findOneAndUpdate(
      key,
      {
        $set: {
          subCode2: cur.code2(ctx.subject),
          paperCode: ctx.codes.join('-'),
          subjectName: [cur.name1(ctx.subject), cur.name2(ctx.subject)].filter(Boolean).join(' & '),
          subjectType: ctx.type,
          mode: manual ? 'MANUAL' : 'AUTO',
          info: buildInfo(ctx.course, ctx.subject),
          entries,
          status: 'DRAFT',
          ...(changed ? { mappedOn: new Date() } : {}),
          verifiedOn: null,
          verifiedBy: null,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    // packets made from the old barcodes are no longer valid
    if (changed) await Rebundle.deleteOne({ mapping: mapping._id });

    ok(res, { mappingId: mapping._id, scripts: entries.length, mode: manual ? 'MANUAL' : 'AUTO' }, 201);
  } catch (err) {
    if (err?.code === 11000) return fail(res, 409, 'A mapping for this paper already exists. Reload the page and try again.');
    serverError(res, err);
  }
};

// PUT /api/barcode/:id/verify
exports.verify = async (req, res) => {
  try {
    const mapping = await BarcodeMapping.findById(req.params.id);
    if (!mapping) return fail(res, 404, 'Mapping not found');
    if (!mapping.entries.length) return fail(res, 400, 'Nothing to verify');
    mapping.status = 'VERIFIED';
    mapping.verifiedOn = new Date();
    mapping.verifiedBy = req.admin?._id || null;
    await mapping.save();
    ok(res, { status: mapping.status });
  } catch (err) {
    serverError(res, err);
  }
};

// DELETE /api/barcode/:id   (Remove mapping, only while DRAFT)
exports.remove = async (req, res) => {
  try {
    const mapping = await BarcodeMapping.findById(req.params.id).select('status');
    if (!mapping) return fail(res, 404, 'Mapping not found');
    if (mapping.status === 'VERIFIED') return fail(res, 409, 'A verified mapping cannot be removed.');
    await Rebundle.deleteOne({ mapping: mapping._id });
    await mapping.deleteOne();
    ok(res, { removed: true });
  } catch (err) {
    serverError(res, err);
  }
};
const ResultSheet = require('../models/Resultsheet');
const ProvisionalCertificate = require('../models/ProvisionalCertificate');
// the consolidated statement already merges every published semester result of a candidate
const { buildStatement, courseContext, semesterNumber } = require('./Consolidatedcontroller');

const ok = (res, data, code = 200) => res.status(code).json({ success: true, data });
const fail = (res, code, message) => res.status(code).json({ success: false, message });
const serverError = (res, err) => fail(res, 500, err.message || 'Server error');

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
const natural = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true });

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
 * Certificate data of one candidate.
 *
 * ELIGIBLE when (ADAPT here if your rules differ):
 *   - a result is published for EVERY semester of the course, and
 *   - no semester still has a reappear (RA) or absent subject.
 */
async function buildCertificate(f) {
  const { data } = await buildStatement(f);
  const { semesters, summary, info, candidate, university } = data;
  const total = summary.totalSemesters;

  const have = new Set(semesters.map((s) => s.term));
  const missing = [];
  for (let t = 1; t <= total; t += 1) if (!have.has(t)) missing.push(ROMAN[t - 1] || t);
  const arrears = semesters.filter((s) => s.result === 'RA').map((s) => ROMAN[s.term - 1] || s.term);

  const reasons = [];
  if (!semesters.length) reasons.push('No results are published for this candidate.');
  else if (missing.length) reasons.push(`No published result for semester ${missing.join(', ')}.`);
  if (arrears.length) reasons.push(`Arrears in semester ${arrears.join(', ')}.`);
  if (!total) reasons.push('The number of semesters of this course is not known.');

  // other batches of this course whose results are published for every semester
  const { keys: courseKeys } = await courseContext(f.instCode, f.course);
  const published = await ResultSheet.find({
    instCode: f.instCode, course: { $in: courseKeys }, status: 'PUBLISHED',
  }).select('batch semester').lean();
  const termsOfBatch = new Map();
  published.forEach((s) => {
    if (!termsOfBatch.has(s.batch)) termsOfBatch.set(s.batch, new Set());
    termsOfBatch.get(s.batch).add(semesterNumber(s.semester));
  });
  const completedBatches = [...termsOfBatch.entries()]
    .filter(([, terms]) => {
      if (!total) return false;
      for (let t = 1; t <= total; t += 1) if (!terms.has(t)) return false;
      return true;
    })
    .map(([batch]) => batch)
    .sort(natural);

  const record = await ProvisionalCertificate.findOne({
    instCode: f.instCode, course: f.course, batch: f.batch, regNo: f.regNo,
  }).lean();

  // "Bachelor of Science in Nursing (B.Sc. NURSING)" when name and code differ
  const degreeName =
    info.courseName && info.courseCode && info.courseName !== info.courseCode
      ? `${info.courseName} (${info.courseCode})`
      : info.courseName || info.courseCode;

  return {
    university,
    info: { ...info, degreeName },
    candidate,
    eligible: reasons.length === 0,
    reasons,
    summary,
    completedBatches,
    issue: record
      ? { issuedOn: record.issuedOn, printCount: record.printCount, lastPrintedOn: record.lastPrintedOn }
      : null,
  };
}

/* ------------------------------ handlers ------------------------------ */

// GET /api/provisional/certificate?instCode=&course=&batch=&regNo=
exports.getCertificate = async (req, res) => {
  try {
    const f = pickFilter(req.query);
    if (missingKeys(f).length) return fail(res, 400, `Missing: ${missingKeys(f).join(', ')}`);
    ok(res, await buildCertificate(f));
  } catch (err) {
    serverError(res, err);
  }
};

// POST /api/provisional/issue   body: { instCode, course, batch, regNo }
// Called by "Print certificate". Refused when the candidate is not eligible.
// The first print fixes the date of issue; reprints keep that date.
exports.issue = async (req, res) => {
  try {
    const f = pickFilter(req.body);
    if (missingKeys(f).length) return fail(res, 400, `Missing: ${missingKeys(f).join(', ')}`);

    const cert = await buildCertificate(f);
    if (!cert.eligible) {
      return fail(res, 400, `This candidate is not eligible. ${cert.reasons.join(' ')}`);
    }

    const now = new Date();
    const record = await ProvisionalCertificate.findOneAndUpdate(
      { instCode: f.instCode, course: f.course, batch: f.batch, regNo: f.regNo },
      {
        $setOnInsert: { issuedOn: now, issuedBy: String(req.admin?._id || '') },
        $set: { lastPrintedOn: now, cgpa: cert.summary.cgpa, examYear: cert.summary.lastExamYear },
        $inc: { printCount: 1 },
      },
      { upsert: true, new: true }
    ).lean();

    ok(res, {
      ...cert,
      issue: { issuedOn: record.issuedOn, printCount: record.printCount, lastPrintedOn: record.lastPrintedOn },
    });
  } catch (err) {
    serverError(res, err);
  }
};
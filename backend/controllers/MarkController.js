const mongoose = require('mongoose');
const Course = require('../models/Course');
const Curriculum = require('../models/Curriculum');
const Rebundle = require('../models/Rebundle');
require('../models/Barcodemapping'); // registers the "BarcodeMapping" model used by populate()

const ok = (res, data, code = 200) => res.status(code).json({ success: true, data });
const fail = (res, code, message) => res.status(code).json({ success: false, message });
const serverError = (res, err) =>
  err.name === 'CastError' ? fail(res, 400, 'Invalid id') : fail(res, 500, err.message || 'Server error');

// entries.barcode: only the barcodes of the mapping are read here, never the register numbers
const MAPPING_FIELDS =
  'instCode course batch semester examYear subCode subCode2 paperCode subjectName subjectType entries.barcode';

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

const natural = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true });

// the practical paper of a subject code is named, so it is not mistaken for the theory paper
const packetLabel = (m, packetNo) =>
  `${m.paperCode}${m.subjectType === 'PRACTICAL' ? ' (Practical)' : ''}, ${m.examYear}, batch ${m.batch}, packet ${packetNo}`;

/**
 * Pass minimum / maximum of the end-semester (external) exam for one mapped paper.
 * Read from Curriculum.externalMinMark / externalMaxMark.
 * ADAPT here if practical papers must use different fields.
 */
const markLimits = async (m) => {
  const course = await Course.findOne({
    instCode: m.instCode,
    $or: [{ courseCode: m.course }, { courseName: m.course }],
  }).lean();
  const courseKeys = [...new Set([m.course, course?.courseCode, course?.courseName].filter(Boolean))];

  const rows = await Curriculum.find({
    instCode: m.instCode,
    course: { $in: courseKeys },
    semester: { $in: semesterVariants(m.semester) },
    subCodeP1: m.subCode,
  }).lean();
  if (!rows.length) return null;

  // the row of the same type as the mapping (Theory / Practical of one subject code have
  // different maximum marks); then: same batch > common (blank batch) > other, Active first
  const typeOf = (c) => (/practical|clinical/i.test(c.component || '') ? 'PRACTICAL' : 'THEORY');
  const wanted = m.subjectType || 'THEORY';
  const score = (c) =>
    (typeOf(c) === wanted ? 8 : 0) +
    (c.batch === m.batch ? 4 : !c.batch ? 2 : 0) + (c.status === 'Active' ? 1 : 0);
  const best = rows.sort((a, b) => score(b) - score(a))[0];

  return { min: Number(best.externalMinMark) || 0, max: Number(best.externalMaxMark) || 0 };
};

/**
 * Scripts that were given a barcode AFTER the paper was re-bundled (a student added later with
 * "Add missing barcodes") are in the mapping but in no packet, so they could not be marked.
 * They are added to the last packet here. Nothing else changes: the existing packets, their
 * evaluators and every mark already entered stay as they are.
 */
const addLateScripts = async (rb) => {
  const entries = rb?.mapping?.entries || [];
  if (!entries.length || !rb.packets?.length) return rb;

  const inPackets = new Set();
  rb.packets.forEach((p) => p.scripts.forEach((s) => inPackets.add(s.barcode)));
  const late = entries.map((e) => e.barcode).filter((b) => b && !inPackets.has(b));
  if (!late.length) return rb;

  const lastNo = Math.max(...rb.packets.map((p) => p.packetNo));
  await Rebundle.updateOne(
    // the condition stops the same barcode being added twice when two people open the page together
    { _id: rb._id, 'packets.scripts.barcode': { $nin: late } },
    { $push: { 'packets.$[p].scripts': { $each: late.map((barcode) => ({ barcode, mark: null })) } } },
    { arrayFilters: [{ 'p.packetNo': lastNo }] }
  );
  return Rebundle.findById(rb._id).populate('mapping', MAPPING_FIELDS).lean();
};

// loads the re-bundle + its mapping and picks one packet
const loadPacket = async (rebundleId, packetNo) => {
  if (!mongoose.isValidObjectId(rebundleId)) return { error: [400, 'Invalid packet'] };
  const no = Number(packetNo);
  if (!Number.isInteger(no) || no < 1) return { error: [400, 'Invalid packet number'] };

  let rb = await Rebundle.findById(rebundleId).populate('mapping', MAPPING_FIELDS).lean();
  if (!rb || !rb.mapping) return { error: [404, 'Packet not found'] };
  rb = await addLateScripts(rb);

  const packet = rb.packets.find((p) => p.packetNo === no);
  if (!packet) return { error: [404, 'Packet not found'] };

  const limits = await markLimits(rb.mapping);
  if (!limits) return { error: [404, 'Subject not found in the curriculum'] };
  if (!limits.max) return { error: [400, 'External maximum mark is not set in the curriculum'] };

  return { rb, packet, limits, packetNo: no };
};

const entered = (packet) => packet.scripts.filter((s) => s.mark !== null && s.mark !== undefined).length;

/* ------------------------------ handlers ------------------------------ */

// GET /api/external-marks/packets
// Every packet of every re-bundled paper, for the Packet dropdown.
exports.getPackets = async (req, res) => {
  try {
    const found = await Rebundle.find().populate('mapping', MAPPING_FIELDS).lean();
    // scripts mapped after the paper was bundled join their paper's last packet
    const rebundles = await Promise.all(found.map((rb) => (rb.mapping ? addLateScripts(rb) : rb)));

    const out = [];
    rebundles.forEach((rb) => {
      const m = rb.mapping;
      if (!m) return; // mapping was removed
      rb.packets.forEach((p) => {
        out.push({
          rebundleId: rb._id,
          packetNo: p.packetNo,
          label: packetLabel(m, p.packetNo),
          paperCode: m.paperCode,
          subjectName: m.subjectName,
          examYear: m.examYear,
          batch: m.batch,
          semester: m.semester,
          subjectType: m.subjectType,
          scripts: p.scripts.length,
          entered: entered(p),
        });
      });
    });

    out.sort(
      (a, b) =>
        natural(a.paperCode, b.paperCode) ||
        natural(b.examYear, a.examYear) ||
        natural(a.batch, b.batch) ||
        a.packetNo - b.packetNo
    );

    ok(res, out);
  } catch (err) {
    serverError(res, err);
  }
};

// GET /api/external-marks/packet?rebundleId=&packetNo=
// Barcodes and marks of one packet. Register numbers are never sent.
exports.getPacket = async (req, res) => {
  try {
    const { rb, packet, limits, packetNo, error } = await loadPacket(
      req.query.rebundleId,
      req.query.packetNo
    );
    if (error) return fail(res, ...error);

    const m = rb.mapping;
    ok(res, {
      rebundleId: rb._id,
      packetNo,
      label: packetLabel(m, packetNo),
      paperCode: m.paperCode,
      subjectName: m.subjectName,
      subjectType: m.subjectType,
      examYear: m.examYear,
      batch: m.batch,
      semester: m.semester,
      min: limits.min,
      max: limits.max,
      rows: packet.scripts.map((s, i) => ({
        sno: i + 1,
        barcode: s.barcode,
        mark: s.mark ?? null,
      })),
    });
  } catch (err) {
    serverError(res, err);
  }
};

// PUT /api/external-marks/packet
// body: { rebundleId, packetNo, marks: [{ barcode, mark }] }   (mark null / '' clears it)
exports.savePacket = async (req, res) => {
  try {
    const { rebundleId, marks } = req.body || {};
    if (!Array.isArray(marks) || !marks.length) return fail(res, 400, 'No marks to save');

    const { rb, packet, limits, packetNo, error } = await loadPacket(rebundleId, req.body.packetNo);
    if (error) return fail(res, ...error);

    const known = new Set(packet.scripts.map((s) => s.barcode));
    const seen = new Set();
    const clean = [];

    for (const row of marks) {
      const barcode = String(row?.barcode ?? '').trim();
      if (!known.has(barcode)) return fail(res, 400, `Barcode ${barcode || '(blank)'} is not in this packet`);
      if (seen.has(barcode)) return fail(res, 400, `Barcode ${barcode} is repeated`);
      seen.add(barcode);

      let mark = null;
      if (row.mark !== null && row.mark !== undefined && row.mark !== '') {
        mark = Number(row.mark);
        if (!Number.isFinite(mark) || mark < 0 || mark > limits.max) {
          return fail(res, 400, `Barcode ${barcode}: mark must be between 0 and ${limits.max}`);
        }
      }
      clean.push({ barcode, mark });
    }

    // one atomic update; only the marks of this packet are touched,
    // so two people saving different packets never overwrite each other
    const $set = {};
    const arrayFilters = [{ 'p.packetNo': packetNo }];
    clean.forEach(({ barcode, mark }, i) => {
      $set[`packets.$[p].scripts.$[s${i}].mark`] = mark;
      arrayFilters.push({ [`s${i}.barcode`]: barcode });
    });
    await Rebundle.updateOne({ _id: rb._id }, { $set }, { arrayFilters });

    const fresh = await Rebundle.findById(rb._id).select('packets').lean();
    const saved = fresh.packets.find((p) => p.packetNo === packetNo);

    ok(res, {
      saved: clean.length,
      scripts: saved.scripts.length,
      entered: entered(saved),
      rows: saved.scripts.map((s, i) => ({ sno: i + 1, barcode: s.barcode, mark: s.mark ?? null })),
    });
  } catch (err) {
    serverError(res, err);
  }
};
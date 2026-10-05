const crypto = require('crypto');
const mongoose = require('mongoose');
const BarcodeMapping = require('../models/Barcodemapping');
const Rebundle = require('../models/Rebundle');
const Evaluator = require('../models/Evaluator'); // replace with your own evaluator / faculty model

const ok = (res, data, code = 200) => res.status(code).json({ success: true, data });
const fail = (res, code, message) => res.status(code).json({ success: false, message });
const serverError = (res, err) =>
  err.name === 'CastError' ? fail(res, 400, 'Invalid id') : fail(res, 500, err.message || 'Server error');

const natural = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true });

const shuffle = (arr) => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(0, i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/**
 * Sealed packets:
 *  - register numbers are sorted and cut into blocks of `packetCount` neighbours
 *  - every block is spread over different packets (one script per packet, random order)
 *  - the scripts inside each packet are shuffled again
 * so neighbouring register numbers never end up in the same packet.
 */
const buildPackets = (entries, size) => {
  const sorted = entries.slice().sort((a, b) => natural(a.regNo, b.regNo));
  const count = Math.ceil(sorted.length / size);
  const packets = Array.from({ length: count }, () => []);

  for (let i = 0; i < sorted.length; i += count) {
    const block = sorted.slice(i, i + count);
    const order = shuffle(packets.map((_, idx) => idx)).sort((a, b) => packets[a].length - packets[b].length);
    block.forEach((e, k) => packets[order[k]].push({ barcode: e.barcode }));
  }

  return packets.map((scripts, idx) => ({ packetNo: idx + 1, scripts: shuffle(scripts), evaluator: null }));
};

const hasMark = (s) => s.mark !== null && s.mark !== undefined;

const packetView = (p) => {
  const scripts = p.scripts.length;
  const marksEntered = p.scripts.filter(hasMark).length;
  return {
    packetNo: p.packetNo,
    scripts,
    barcodes: p.scripts.map((s) => s.barcode),
    evaluatorId: p.evaluator?._id || p.evaluator || null,
    evaluatorName: p.evaluator?.name || '',
    marksEntered,
    status: marksEntered === scripts ? 'Completed' : marksEntered > 0 ? 'In progress' : 'Pending',
  };
};

// GET /api/rebundle/papers?examYear=   -> exam years + mapped papers of that year
exports.listPapers = async (req, res) => {
  try {
    const examYears = (await BarcodeMapping.distinct('examYear')).map(String).sort(natural).reverse();
    const examYear = String(req.query.examYear || examYears[0] || '');

    const papers = examYear
      ? await BarcodeMapping.aggregate([
          { $match: { examYear } },
          { $project: { paperCode: 1, batch: 1, semester: 1, status: 1, scripts: { $size: '$entries' } } },
          { $sort: { paperCode: 1, batch: 1 } },
        ])
      : [];

    ok(res, {
      examYears,
      examYear,
      papers: papers.map((p) => ({
        id: String(p._id),
        paperCode: p.paperCode,
        batch: p.batch,
        semester: p.semester,
        status: p.status,
        scripts: p.scripts,
        label: `${p.paperCode}, batch ${p.batch} (${p.scripts} scripts)`,
      })),
    });
  } catch (err) {
    serverError(res, err);
  }
};

// GET /api/rebundle/evaluators
exports.listEvaluators = async (req, res) => {
  try {
    const filter = { active: { $ne: false } };
    if (req.query.instCode) filter.instCode = req.query.instCode;
    ok(res, await Evaluator.find(filter).select('name department').sort({ name: 1 }).lean());
  } catch (err) {
    serverError(res, err);
  }
};

// GET /api/rebundle/:mappingId
exports.getDetail = async (req, res) => {
  try {
    const mapping = await BarcodeMapping.findById(req.params.mappingId).select('-entries').lean();
    if (!mapping) return fail(res, 404, 'Mapped paper not found');
    const count = await BarcodeMapping.aggregate([
      { $match: { _id: mapping._id } },
      { $project: { n: { $size: '$entries' } } },
    ]);

    const rb = await Rebundle.findOne({ mapping: mapping._id }).populate('packets.evaluator', 'name').lean();

    ok(res, {
      mapping: {
        id: String(mapping._id),
        paperCode: mapping.paperCode,
        subjectName: mapping.subjectName,
        batch: mapping.batch,
        semester: mapping.semester,
        status: mapping.status,
        scripts: count[0]?.n || 0,
        info: mapping.info || {},
      },
      bundled: !!rb,
      packetSize: rb?.packetSize || null,
      packets: rb ? rb.packets.map(packetView) : [],
    });
  } catch (err) {
    serverError(res, err);
  }
};

// POST /api/rebundle   { mappingId, packetSize }
exports.rebundle = async (req, res) => {
  try {
    const { mappingId } = req.body;
    const size = parseInt(req.body.packetSize, 10);
    if (!mongoose.isValidObjectId(mappingId)) return fail(res, 400, 'mappingId is required');
    if (!Number.isInteger(size) || size < 1 || size > 500) return fail(res, 400, 'Scripts per packet must be 1 to 500');

    const mapping = await BarcodeMapping.findById(mappingId).lean();
    if (!mapping) return fail(res, 404, 'Mapped paper not found');
    if (!mapping.entries.length) return fail(res, 400, 'This mapping has no scripts');

    const old = await Rebundle.findOne({ mapping: mappingId }).lean();
    if (old?.packets.some((p) => p.scripts.some(hasMark))) {
      return fail(res, 409, 'Marks are already entered for this paper. Re-bundle is locked.');
    }

    const packets = buildPackets(mapping.entries, size);
    await Rebundle.findOneAndUpdate(
      { mapping: mappingId },
      { $set: { packetSize: size, packets, bundledOn: new Date(), bundledBy: req.admin?._id || null } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    ok(res, { packets: packets.length }, 201);
  } catch (err) {
    serverError(res, err);
  }
};

// PUT /api/rebundle/:mappingId/packets/:packetNo/evaluator   { evaluatorId | null }
exports.assignEvaluator = async (req, res) => {
  try {
    const { mappingId, packetNo } = req.params;
    const { evaluatorId } = req.body;
    if (evaluatorId && !(await Evaluator.exists({ _id: evaluatorId }))) return fail(res, 404, 'Evaluator not found');

    const rb = await Rebundle.findOneAndUpdate(
      { mapping: mappingId, 'packets.packetNo': Number(packetNo) },
      { $set: { 'packets.$.evaluator': evaluatorId || null } },
      { new: true }
    );
    if (!rb) return fail(res, 404, 'Packet not found');
    ok(res, { packetNo: Number(packetNo), evaluatorId: evaluatorId || null });
  } catch (err) {
    serverError(res, err);
  }
};

// exported for tests
exports._buildPackets = buildPackets;
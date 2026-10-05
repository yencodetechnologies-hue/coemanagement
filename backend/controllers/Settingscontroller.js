const Settings = require('../models/Settingsmodel');

const bad = (message, status = 400) => Object.assign(new Error(message), { status });
const str = (v) => (typeof v === 'string' ? v.trim() : '');
const handle = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
// MAR-2026 sorts before SEP-2026
const sessionOrder = (s) => Number(s.name.slice(4)) * 10 + (s.name.startsWith('MAR') ? 1 : 2);

// Data is entered manually in MongoDB, so nothing is auto-created here.
async function getDoc() {
  const doc = await Settings.findOne({ key: 'main' });
  if (!doc) {
    throw bad('No settings found. Add the settings document (key: "main") to the "settings" collection in MongoDB.', 404);
  }
  return doc;
}

const reply = (res, doc, status = 200) =>
  res.status(status).json({
    success: true,
    data: {
      university: doc.university,
      gradingScale: doc.gradingScale,
      sessions: doc.sessions,
      nextGradeStatementSerial: doc.nextGradeStatementSerial,
    },
  });

exports.getSettings = handle(async (req, res) => reply(res, await getDoc()));

exports.updateUniversity = handle(async (req, res) => {
  const b = req.body || {};
  const u = {
    name: str(b.name), shortName: str(b.shortName), recognition: str(b.recognition),
    address: str(b.address), signatoryTitle: str(b.signatoryTitle),
  };
  if (!u.name) throw bad('University name is required');
  if (!u.shortName) throw bad('Short name is required');
  if (!u.signatoryTitle) throw bad('Signatory title is required');
  const doc = await getDoc();
  doc.university = u;
  await doc.save();
  reply(res, doc);
});

exports.updateGradingScale = handle(async (req, res) => {
  const rows = (req.body?.gradingScale || []).map((r) => ({
    grade: str(r.grade), description: str(r.description),
    minPercent: Number(r.minPercent), gradePoint: Number(r.gradePoint),
  }));
  if (rows.length < 2) throw bad('Add at least two grades');
  const seen = new Set();
  for (const r of rows) {
    if (!r.grade || !r.description) throw bad('Every grade needs a letter and a description');
    if (seen.has(r.grade.toLowerCase())) throw bad(`Grade "${r.grade}" is repeated`);
    seen.add(r.grade.toLowerCase());
    if (!Number.isFinite(r.minPercent) || r.minPercent < 0 || r.minPercent > 100)
      throw bad(`Minimum % for "${r.grade}" must be between 0 and 100`);
    if (!Number.isFinite(r.gradePoint) || r.gradePoint < 0)
      throw bad(`Grade point for "${r.grade}" must be 0 or more`);
  }
  rows.sort((a, b) => b.minPercent - a.minPercent);
  for (let i = 1; i < rows.length; i++)
    if (rows[i].minPercent === rows[i - 1].minPercent) throw bad('Two grades cannot have the same minimum %');
  if (rows[rows.length - 1].minPercent !== 0) throw bad('The lowest grade must start at 0%');
  const doc = await getDoc();
  doc.gradingScale = rows;
  await doc.save();
  reply(res, doc);
});

exports.addSession = handle(async (req, res) => {
  const name = str(req.body?.name).toUpperCase();
  if (!/^(MAR|SEP)-\d{4}$/.test(name)) throw bad('Use the format MAR-2028 or SEP-2028');
  const doc = await getDoc();
  if (doc.sessions.some((s) => s.name === name)) throw bad(`${name} already exists`, 409);
  doc.sessions.push({ name, active: false });
  doc.sessions.sort((a, b) => sessionOrder(a) - sessionOrder(b));
  await doc.save();
  reply(res, doc, 201);
});

exports.activateSession = handle(async (req, res) => {
  const doc = await getDoc();
  if (!doc.sessions.some((s) => s.name === req.params.name)) throw bad('Session not found', 404);
  doc.sessions.forEach((s) => { s.active = s.name === req.params.name; });
  await doc.save();
  reply(res, doc);
});

exports.deleteSession = handle(async (req, res) => {
  const doc = await getDoc();
  const s = doc.sessions.find((x) => x.name === req.params.name);
  if (!s) throw bad('Session not found', 404);
  if (s.active) throw bad('Make another session active before deleting this one', 409);
  doc.sessions = doc.sessions.filter((x) => x.name !== req.params.name);
  await doc.save();
  reply(res, doc);
});

exports.updateSerial = handle(async (req, res) => {
  const n = Number(req.body?.nextGradeStatementSerial);
  if (!Number.isInteger(n) || n < 1) throw bad('Serial number must be a whole number, 1 or more');
  const doc = await getDoc();
  doc.nextGradeStatementSerial = n;
  await doc.save();
  reply(res, doc);
});
const mongoose = require('mongoose');
const Institution = require('../models/Institution');

const bad = (message, status = 400) => Object.assign(new Error(message), { status });
const str = (v) => (typeof v === 'string' ? v.trim() : '');
const handle = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^[0-9+\-\s()]{7,15}$/;

function clean(body = {}) {
  const d = {
    instCode: str(body.instCode).toUpperCase(),
    instName: str(body.instName),
    discipline: str(body.discipline),
    headDesignation: str(body.headDesignation),
    city: str(body.city),
    phone: str(body.phone),
    email: str(body.email).toLowerCase(),
    status: str(body.status) || 'Active',
  };
  if (!d.instCode) throw bad('Inst code is required');
  if (!d.instName) throw bad('Inst name is required');
  if (!d.discipline) throw bad('Discipline is required');
  if (d.phone && !PHONE.test(d.phone)) throw bad('Enter a valid phone number');
  if (d.email && !EMAIL.test(d.email)) throw bad('Enter a valid email address');
  if (!['Active', 'Inactive'].includes(d.status)) throw bad('Status must be Active or Inactive');
  return d;
}

const duplicate = (e, code) => (e.code === 11000 ? bad(`Inst code ${code} already exists`, 409) : e);

async function findOr404(id) {
  if (!mongoose.isValidObjectId(id)) throw bad('Institution not found', 404);
  const doc = await Institution.findById(id);
  if (!doc) throw bad('Institution not found', 404);
  return doc;
}

// GET /api/institutions?page=1&limit=10&search=&status=
exports.list = handle(async (req, res) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);
  const search = str(req.query.search);
  const status = str(req.query.status);

  const filter = {};
  if (['Active', 'Inactive'].includes(status)) filter.status = status;
  if (search) {
    const rx = new RegExp(escapeRegex(search), 'i');
    filter.$or = [{ instCode: rx }, { instName: rx }, { discipline: rx }, { city: rx }, { phone: rx }, { email: rx }];
  }

  const [items, total] = await Promise.all([
    Institution.find(filter).sort({ instCode: 1 }).skip((page - 1) * limit).limit(limit).lean(),
    Institution.countDocuments(filter),
  ]);
  res.json({ success: true, data: { items, total, page, limit, totalPages: Math.max(Math.ceil(total / limit), 1) } });
});

exports.create = handle(async (req, res) => {
  const d = clean(req.body);
  try {
    const doc = await Institution.create(d);
    res.status(201).json({ success: true, data: doc });
  } catch (e) {
    throw duplicate(e, d.instCode);
  }
});

exports.update = handle(async (req, res) => {
  const d = clean(req.body);
  const doc = await findOr404(req.params.id);
  doc.set(d);
  try {
    await doc.save();
  } catch (e) {
    throw duplicate(e, d.instCode);
  }
  res.json({ success: true, data: doc });
});

exports.remove = handle(async (req, res) => {
  const doc = await findOr404(req.params.id);
  await doc.deleteOne();
  res.json({ success: true, data: { id: req.params.id } });
});
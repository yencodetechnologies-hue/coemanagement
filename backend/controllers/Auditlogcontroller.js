const AuditLog = require('../models/Auditlog');

const ok = (res, data) => res.json({ success: true, data });
const fail = (res, code, message) => res.status(code).json({ success: false, message });

const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// GET /api/audit-logs?page=&limit=&search=&staffId=&module=&action=&from=&to=&success=
exports.list = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const { search, staffId, module, action, from, to, success } = req.query;

    const q = {};
    if (staffId) q.staffId = staffId === 'unknown' ? '' : String(staffId);
    if (module) q.module = String(module);
    if (action) q.action = String(action);
    if (success === 'true' || success === 'false') q.success = success === 'true';
    if (search) {
      const re = new RegExp(escapeRe(search).slice(0, 100), 'i');
      q.$or = [{ summary: re }, { staffName: re }, { employeeId: re }, { path: re }, { targetId: re }];
    }
    if (from || to) {
      q.createdAt = {};
      if (from) {
        if (!DATE_RE.test(from)) return fail(res, 400, 'Invalid from date');
        q.createdAt.$gte = new Date(`${from}T00:00:00`);
      }
      if (to) {
        if (!DATE_RE.test(to)) return fail(res, 400, 'Invalid to date');
        q.createdAt.$lte = new Date(`${to}T23:59:59.999`);
      }
    }

    const [rows, total] = await Promise.all([
      AuditLog.find(q).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      AuditLog.countDocuments(q),
    ]);

    ok(res, { rows, total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) });
  } catch (err) {
    fail(res, 500, err.message);
  }
};

// GET /api/audit-logs/filters   -> values for the dropdowns
exports.filters = async (req, res) => {
  try {
    const [modules, actions, staff] = await Promise.all([
      AuditLog.distinct('module'),
      AuditLog.distinct('action'),
      AuditLog.aggregate([
        { $group: { _id: '$staffId', name: { $last: '$staffName' }, employeeId: { $last: '$employeeId' } } },
        { $sort: { name: 1 } },
      ]),
    ]);
    ok(res, {
      modules: modules.filter(Boolean).sort(),
      actions: actions.filter(Boolean).sort(),
      staff: staff.map((s) => ({ staffId: s._id || 'unknown', name: s.name, employeeId: s.employeeId })),
    });
  } catch (err) {
    fail(res, 500, err.message);
  }
};
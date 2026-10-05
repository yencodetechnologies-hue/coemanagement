const mongoose = require('mongoose');
const AuditLog = require('../models/Auditlog');

/**
 * Audit logger.
 *
 * Records every request that CHANGES something (POST / PUT / PATCH / DELETE):
 * which staff did it, what they did, the values they sent and, when the request addresses
 * one record by id, exactly which fields changed (before -> after).
 *
 * In server.js, right after express.json():
 *
 *   app.use(require('./middleware/Auditlogger'));   // your file name
 *
 * It also switches itself on as soon as it is loaded, so it still records everything if that
 * line ends up below the routes.
 *
 * How: it listens at the Node HTTP server, in front of Express, so it does not matter where
 * that line sits among your other routes.
 *
 * The staff comes from the "x-staff-id" header, which the frontend adds to every request
 * (components/Header.jsx). There is no login in this app, so this is the staff SELECTED in
 * the header, not a verified identity.
 */

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const SKIP_FIELDS = new Set(['_id', '__v', 'createdAt', 'updatedAt']);
const SECRET_KEY = /pass(word)?|token|secret|otp/i;
const MAX_VALUE = 2000;    // characters kept for one before / after value
const MAX_DETAILS = 30000; // characters kept for the request body

// ADAPT: readable names for your route prefixes (/api/<prefix>/...). Others are title-cased.
const MODULE_NAMES = {
  auth: 'Sign in',
  settings: 'Settings',
  institutions: 'Institutions',
  ceostaff: 'Staff',
  coestaff: 'Staff',
  students: 'Students',
  courses: 'Courses',
  curriculum: 'Curriculum',
  'attendance-marks': 'Attendance and internal marks',
  'nominal-roll': 'Nominal roll',
  'theory-timetable': 'Theory time table',
  application: 'Application and hall ticket',
  barcode: 'Bar code mapping',
  rebundle: 'Re-bundle',
  'external-marks': 'External mark entry',
  results: 'Result processing',
  consolidated: 'Consolidated grade statement',
  provisional: 'Provisional certificate',
};

const ACTION_WORDS = [
  [/log-?in|sign-?in/i, 'Signed in'],
  [/log-?out|sign-?out/i, 'Signed out'],
  [/publish/i, 'Published'],
  [/withdraw/i, 'Withdrew'],
  [/verify/i, 'Verified'],
  [/generate/i, 'Generated'],
  [/issue/i, 'Issued'],
  [/rebundle/i, 'Re-bundled'],
];
const METHOD_ACTION = { POST: 'Created', PUT: 'Updated', PATCH: 'Updated', DELETE: 'Deleted' };

// "/api/institutions/123" -> ["institutions", "123"]   (works with or without the /api prefix)
const partsOf = (path) => {
  const parts = path.split('/').filter(Boolean);
  return parts[0] === 'api' ? parts.slice(1) : parts;
};

const moduleOf = (path) => {
  const seg = partsOf(path)[0] || '';
  if (MODULE_NAMES[seg.toLowerCase()]) return MODULE_NAMES[seg.toLowerCase()];
  return seg.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
};

const actionOf = (method, path) => {
  const tail = partsOf(path).slice(1).join('/'); // after the route prefix
  const special = ACTION_WORDS.find(([re]) => re.test(tail));
  return special ? special[1] : METHOD_ACTION[method];
};

// a short human name for a record
const labelOf = (doc) =>
  doc &&
  (doc.fullName || doc.studentName || doc.name || doc.title || doc.courseName || doc.instName ||
    doc.paperCode || doc.subNameP1 || doc.regNo || doc.registerNo || doc.employeeId || doc.hallTicketNo || '');

const clip = (value) => {
  if (value === undefined) return null;
  const text = JSON.stringify(value);
  if (text === undefined) return null;
  return text.length > MAX_VALUE ? `${text.slice(0, MAX_VALUE)}… (${text.length} characters)` : value;
};

// hide secrets, keep everything else
const sanitize = (value) => {
  if (Array.isArray(value)) return value.map(sanitize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, SECRET_KEY.test(k) ? '••••' : sanitize(v)])
    );
  }
  return value;
};

const bodyDetails = (body) => {
  if (!body || typeof body !== 'object' || !Object.keys(body).length) return null;
  const clean = sanitize(body);
  const text = JSON.stringify(clean);
  return text.length > MAX_DETAILS
    ? { truncated: true, preview: `${text.slice(0, MAX_DETAILS)}… (${text.length} characters)` }
    : clean;
};

const diff = (before, after) => {
  const out = [];
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  keys.forEach((field) => {
    if (SKIP_FIELDS.has(field)) return;
    const a = before?.[field];
    const b = after?.[field];
    if (JSON.stringify(a) === JSON.stringify(b)) return;
    out.push({ field, from: clip(a), to: clip(b) });
  });
  return out;
};

// the record an id belongs to, whichever collection it lives in
const findAnywhere = async (id) => {
  const names = mongoose.modelNames().filter((n) => n !== 'AuditLog');
  const found = await Promise.all(
    names.map((name) =>
      mongoose.model(name).findById(id).lean().then((doc) => (doc ? { name, doc } : null)).catch(() => null)
    )
  );
  return found.find(Boolean) || null;
};

// staff of the request (small cache so it is not read on every request)
const staffCache = new Map();
const staffOf = async (req) => {
  const id = String(req.headers['x-staff-id'] || '').trim();
  if (!mongoose.isValidObjectId(id)) return null;
  const hit = staffCache.get(id);
  if (hit && Date.now() - hit.at < 60000) return hit.staff;
  const CoeStaff = mongoose.models.CoeStaff; // registered by your staff controller
  const staff = CoeStaff
    ? await CoeStaff.findById(id).select('employeeId fullName designation accessRole status').lean().catch(() => null)
    : null;
  staffCache.set(id, { at: Date.now(), staff });
  return staff;
};

/**
 * Starts the audit of one request. Resolves once the staff and the record's "before" state
 * are read, so the request must only continue after it resolves.
 */
function begin(req, res) {
  const path = String(req.originalUrl || req.url || '').split('?')[0];
  if (!MUTATING.has(req.method) || path.includes('/audit-logs') || req.__audit) {
    return Promise.resolve();
  }
  req.__audit = true; // never log the same request twice

  const state = { staff: null, target: null };
  const idInPath = (path.match(/[a-f0-9]{24}/i) || [])[0];

  // remember what the server answered (res.json is Express's; look it up when it is called)
  let answer = null;
  res.json = function auditJson(body) {
    answer = body;
    return Object.getPrototypeOf(this).json.call(this, body);
  };

  res.on('finish', async () => {
    try {
      const { staff, target } = state;
      const success = res.statusCode < 400;
      const action = actionOf(req.method, path);
      const module = moduleOf(path);

      let changes = [];
      const details = {};
      const body = bodyDetails(req.body);
      if (body) details.sent = body;
      if (req.query && Object.keys(req.query).length) details.query = { ...req.query };

      const targetModel = target?.name || '';
      let targetId = idInPath || '';
      let label = labelOf(target?.doc) || labelOf(req.body);

      if (success && target) {
        if (req.method === 'DELETE') {
          details.deleted = clip(target.doc);
        } else {
          const after = await mongoose.model(target.name).findById(idInPath).lean().catch(() => null);
          if (after) changes = diff(target.doc, after);
          else details.deleted = clip(target.doc); // removed by a non-DELETE route
        }
      }
      // a newly created record: take its id / name from the answer when it is there
      if (success && !target) {
        const created = answer?.data && typeof answer.data === 'object' ? answer.data : null;
        if (created?._id) targetId = String(created._id);
        label = label || labelOf(created);
      }

      await AuditLog.create({
        staffId: staff ? String(staff._id) : '',
        employeeId: staff?.employeeId || '',
        staffName: staff?.fullName || 'Unknown staff',
        designation: staff?.designation || '',
        accessRole: staff?.accessRole || '',
        action,
        module,
        summary: `${action}${module === 'Sign in' ? '' : ` ${module}`}${label ? `: ${label}` : ''}${success ? '' : ' (failed)'}`,
        targetModel,
        targetId,
        changes,
        details,
        method: req.method,
        path,
        statusCode: res.statusCode,
        success,
        message: typeof answer?.message === 'string' ? answer.message.slice(0, 500) : '',
        ip: req.socket?.remoteAddress || '',
      });
      console.log(`[audit] recorded: ${req.method} ${path} by ${staff?.fullName || 'Unknown staff'}`);
    } catch (err) {
      console.error('Audit log failed:', err.message); // never break the request because of the log
    }
  });

  // read the staff and the record BEFORE the route changes it
  return Promise.all([
    staffOf(req).then((s) => {
      state.staff = s;
      if (s && !req.admin) req.admin = s; // controllers that store "issuedBy / publishedBy" pick this up
    }),
    idInPath ? findAnywhere(idInPath).then((t) => { state.target = t; }) : null,
  ]).catch(() => {});
}

/* ------------------------------------------------------------------ *
 * Switch on: every HTTP(S) server of this process hands its requests
 * to begin() first, then to Express.
 * ------------------------------------------------------------------ */
if (!global.__coeAuditInstalled) {
  global.__coeAuditInstalled = true;
  [require('http'), require('https')].forEach((lib) => {
    const proto = lib.Server.prototype;
    const originalEmit = proto.emit;
    proto.emit = function auditEmit(event, req, res, ...rest) {
      if (event === 'request' && req && res && MUTATING.has(req.method)) {
        begin(req, res).then(() => originalEmit.call(this, event, req, res, ...rest));
        return true;
      }
      return originalEmit.call(this, event, req, res, ...rest);
    };
  });
  console.log('[audit] logger active');
}

// Also usable as a normal Express middleware (app.use(...)); harmless if both are in place.
module.exports = function auditLogger(req, res, next) {
  begin(req, res).then(() => next());
};
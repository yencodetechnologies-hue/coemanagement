const mongoose = require('mongoose');
const Role = require('../models/Role');
const { MODULE_KEYS, MODULE_NAME } = require('../config/Permissionmodules');

/**
 * Permission check: stops a create / edit / verify / delete that the staff's role is not
 * allowed to do, and answers 403 with a clear message.
 *
 * In server.js, AFTER the audit logger and BEFORE your routes:
 *
 *   app.use(require('./middleware/permissions'));
 *
 * Rules:
 *   - the module is the route prefix:  /api/<module>/...
 *   - POST = create, PUT / PATCH = edit, DELETE = delete; a route whose address contains
 *     verify / publish / withdraw / issue / approve needs "verify"
 *   - reading (GET) is not checked here: pages share their dropdown and list routes, so
 *     "View" is meant for showing or hiding the page in the menu
 *   - the role is read fresh on every change, so a tick on the Roles page applies at once
 *   - a request with no staff, or a staff whose role is not set up yet, is let through
 *     (there is no login, so this guards against mistakes; it is not a security barrier)
 */

const VERIFY_RE = /verify|publish|withdraw|issue|approve/i;
const METHOD_ACTION = { POST: 'create', PUT: 'edit', PATCH: 'edit', DELETE: 'delete' };
const ACTION_TEXT = { create: 'create', edit: 'edit', delete: 'delete', verify: 'verify or approve' };

module.exports = async function permissions(req, res, next) {
  try {
    const base = METHOD_ACTION[req.method];
    if (!base) return next(); // GET and others

    const parts = String(req.originalUrl || req.url).split('?')[0].split('/').filter(Boolean);
    const rest = parts[0] === 'api' ? parts.slice(1) : parts;
    const moduleKey = rest[0];
    if (!MODULE_KEYS.includes(moduleKey)) return next(); // e.g. /api/auth

    const staffId = String(req.headers['x-staff-id'] || '');
    const Staff = mongoose.models.CoeStaff;
    if (!Staff || !mongoose.isValidObjectId(staffId)) return next();

    const staff = await Staff.findById(staffId).select('fullName accessRole').lean();
    if (!staff) return next();
    const role = await Role.findOne({ name: staff.accessRole }).select('name permissions').lean();
    if (!role) return next();

    const action = VERIFY_RE.test(rest.slice(1).join('/')) ? 'verify' : base;
    if (role.permissions?.[moduleKey]?.[action] === true) return next();

    return res.status(403).json({
      success: false,
      message: `Your role (${role.name}) is not allowed to ${ACTION_TEXT[action]} in ${MODULE_NAME[moduleKey]}.`,
    });
  } catch (err) {
    return next(); // never block the app because the check itself failed
  }
};
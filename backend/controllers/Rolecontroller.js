const mongoose = require('mongoose');
const Role = require('../models/Role');
const {
  ACTIONS, ACTION_KEYS, MODULE_GROUPS, MODULE_KEYS, MODULE_NAME, DEFAULT_ROLES, normalize, blank,
} = require('../config/Permissionmodules');

const ok = (res, data, code = 200) => res.status(code).json({ success: true, data });
const fail = (res, code, message) => res.status(code).json({ success: false, message });
const serverError = (res, err) =>
  err.name === 'CastError' ? fail(res, 400, 'Invalid id') : fail(res, 500, err.message || 'Server error');

// the staff model your staff controller registered (not required here by file name)
const Staff = () => mongoose.models.CoeStaff || null;

const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// First use: create the starting roles, and a role for any access role already used by staff.
async function ensureRoles() {
  if (!(await Role.estimatedDocumentCount())) {
    await Role.insertMany(DEFAULT_ROLES, { ordered: false }).catch(() => {});
  }
  if (Staff()) {
    const used = (await Staff().distinct('accessRole')).filter(Boolean);
    const have = new Set((await Role.find().select('name').lean()).map((r) => r.name));
    const missing = used.filter((n) => !have.has(n));
    if (missing.length) {
      await Role.insertMany(missing.map((name) => ({ name, permissions: blank() })), { ordered: false }).catch(() => {});
    }
  }
}

// can someone still manage roles if this role loses that right?
const anotherRoleManages = async (exceptId) => {
  const others = await Role.find({ _id: { $ne: exceptId } }).select('permissions').lean();
  return others.some((r) => r.permissions?.roles?.view === true && r.permissions?.roles?.edit === true);
};

const present = (role, staffByRole) => {
  const staff = staffByRole.get(role.name) || [];
  return {
    _id: role._id,
    name: role.name,
    staffCount: staff.length,
    staff,
    permissions: normalize(role.permissions),
  };
};

const loadStaffByRole = async () => {
  const map = new Map();
  if (!Staff()) return map;
  const rows = await Staff().find({ status: 'Active' }).select('fullName accessRole').sort({ fullName: 1 }).lean();
  rows.forEach((s) => {
    if (!map.has(s.accessRole)) map.set(s.accessRole, []);
    map.get(s.accessRole).push(s.fullName);
  });
  return map;
};

/* ------------------------------ handlers ------------------------------ */

// GET /api/roles   -> modules, actions and every role with its permissions and staff
exports.list = async (req, res) => {
  try {
    await ensureRoles();
    const [roles, staffByRole] = await Promise.all([
      Role.find().sort({ order: 1, createdAt: 1 }).lean(),
      loadStaffByRole(),
    ]);
    ok(res, {
      actions: ACTIONS,
      groups: MODULE_GROUPS,
      roles: roles.map((r) => present(r, staffByRole)),
    });
  } catch (err) {
    serverError(res, err);
  }
};

// GET /api/roles/me   -> the permissions of the staff selected in the header
exports.me = async (req, res) => {
  try {
    const id = String(req.headers['x-staff-id'] || '');
    const staff =
      Staff() && mongoose.isValidObjectId(id)
        ? await Staff().findById(id).select('fullName accessRole').lean()
        : null;
    const role = staff ? await Role.findOne({ name: staff.accessRole }).lean() : null;
    ok(res, {
      staff: staff ? { _id: staff._id, fullName: staff.fullName } : null,
      role: role?.name || staff?.accessRole || '',
      permissions: role ? normalize(role.permissions) : null, // null = role not set up, nothing is restricted
    });
  } catch (err) {
    serverError(res, err);
  }
};

// POST /api/roles   body: { name }   -> a new role with nothing ticked
exports.create = async (req, res) => {
  try {
    const name = String(req.body?.name || '').trim().replace(/\s+/g, ' ');
    if (name.length < 2 || name.length > 60) return fail(res, 400, 'Role name must be 2 to 60 characters.');
    const clash = await Role.findOne({ name: new RegExp(`^${escapeRe(name)}$`, 'i') }).lean();
    if (clash) return fail(res, 409, `A role named "${clash.name}" already exists.`);

    const role = await Role.create({ name, permissions: blank() });
    ok(res, present(role.toObject(), new Map()), 201);
  } catch (err) {
    serverError(res, err);
  }
};

// PATCH /api/roles/:id/permissions   body: { changes: [{ module, action, value }] }
// Only the ticked / unticked boxes are sent, so two people editing never overwrite each other.
exports.updatePermissions = async (req, res) => {
  try {
    const changes = Array.isArray(req.body?.changes) ? req.body.changes : [];
    if (!changes.length) return fail(res, 400, 'No changes sent.');

    const $set = {};
    for (const c of changes) {
      if (!MODULE_KEYS.includes(c?.module)) return fail(res, 400, `Unknown module: ${c?.module}`);
      if (!ACTION_KEYS.includes(c?.action)) return fail(res, 400, `Unknown action: ${c?.action}`);
      if (typeof c.value !== 'boolean') return fail(res, 400, 'Value must be true or false.');
      $set[`permissions.${c.module}.${c.action}`] = c.value;
    }

    const role = await Role.findById(req.params.id).lean();
    if (!role) return fail(res, 404, 'Role not found');

    // never leave the system with nobody able to manage roles
    const losesControl = changes.some(
      (c) => c.module === 'roles' && (c.action === 'view' || c.action === 'edit') && c.value === false
    );
    if (losesControl && !(await anotherRoleManages(role._id))) {
      return fail(res, 400, `At least one role must keep View and Edit on ${MODULE_NAME.roles}.`);
    }

    const updated = await Role.findByIdAndUpdate(role._id, { $set }, { new: true }).lean();
    ok(res, present(updated, await loadStaffByRole()));
  } catch (err) {
    serverError(res, err);
  }
};

// DELETE /api/roles/:id   (only a role no staff belongs to)
exports.remove = async (req, res) => {
  try {
    const role = await Role.findById(req.params.id).lean();
    if (!role) return fail(res, 404, 'Role not found');

    const inUse = Staff() ? await Staff().countDocuments({ accessRole: role.name }) : 0;
    if (inUse) {
      return fail(res, 409, `${inUse} staff ${inUse > 1 ? 'have' : 'has'} this role. Move them to another role first.`);
    }
    const manages = role.permissions?.roles?.view === true && role.permissions?.roles?.edit === true;
    if (manages && !(await anotherRoleManages(role._id))) {
      return fail(res, 400, `This is the only role that can manage ${MODULE_NAME.roles}.`);
    }

    await Role.deleteOne({ _id: role._id });
    ok(res, { removed: true });
  } catch (err) {
    serverError(res, err);
  }
};
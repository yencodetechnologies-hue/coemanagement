// The modules and actions shown on the Roles & permissions page.
// `key` is the API route prefix of the module (/api/<key>/...) wherever it has one, so the
// permission check in middleware/permissions.js can tell which module a request belongs to.

const ACTIONS = [
  { key: 'view', label: 'View' },
  { key: 'create', label: 'Create' },
  { key: 'edit', label: 'Edit' },
  { key: 'verify', label: 'Verify / approve' },
  { key: 'delete', label: 'Delete' },
];

const MODULE_GROUPS = [
  { label: 'Overview', modules: [{ key: 'dashboard', name: 'Dashboard' }] },
  { label: 'Admission', modules: [{ key: 'students', name: 'Student profile' }] },
  {
    label: 'Base details',
    modules: [
      { key: 'institutions', name: 'Institutions' },
      { key: 'courses', name: 'Course details' },
      { key: 'curriculum', name: 'Curriculum master' },
    ],
  },
  {
    label: 'Pre-exam',
    modules: [
      { key: 'nominal-roll', name: 'Student nominal roll' },
      { key: 'attendance-marks', name: 'Attendance & internal marks' },
      { key: 'theory-timetable', name: 'Theory time table' },
      { key: 'application', name: 'Application & hall ticket' },
    ],
  },
  {
    label: 'Post-exam',
    modules: [
      { key: 'barcode', name: 'Bar code mapping' },
      { key: 'rebundle', name: 'Re-bundle' },
      { key: 'external-marks', name: 'External mark entry' },
    ],
  },
  {
    label: 'Result process',
    modules: [
      { key: 'results', name: 'Result processing' },
      { key: 'semester-statement', name: 'Semester grade statement' },
      { key: 'consolidated', name: 'Consolidated grade statement' },
    ],
  },
  {
    label: 'Certificates & reports',
    modules: [
      { key: 'provisional', name: 'Provisional certificate' },
      { key: 'reports', name: 'Reports' },
    ],
  },
  {
    label: 'Administration',
    modules: [
      { key: 'ceostaff', name: 'COE staff' },
      { key: 'roles', name: 'Roles & permissions' },
      { key: 'settings', name: 'Settings' },
      { key: 'audit-logs', name: 'Audit log' },
    ],
  },
];

const ACTION_KEYS = ACTIONS.map((a) => a.key);
const MODULES = MODULE_GROUPS.flatMap((g) => g.modules);
const MODULE_KEYS = MODULES.map((m) => m.key);
const MODULE_NAME = Object.fromEntries(MODULES.map((m) => [m.key, m.name]));

// { view: true, create: false, ... } for every module, from a short description
const grant = (list) => Object.fromEntries(ACTION_KEYS.map((a) => [a, list.includes(a)]));
const ALL = ACTION_KEYS;
const build = (rules, fallback = []) =>
  Object.fromEntries(MODULE_KEYS.map((key) => [key, grant(rules[key] || fallback)]));

const groupKeys = (label) => MODULE_GROUPS.find((g) => g.label === label).modules.map((m) => m.key);
const forKeys = (keys, list) => Object.fromEntries(keys.flat().map((k) => [k, list]));

// Starting roles, created the first time the page is opened. Change them on the page.
const DEFAULT_ROLES = [
  { name: 'Controller of Examinations', permissions: build({}, ALL) },
  {
    name: 'Deputy Controller',
    permissions: build(
      { ceostaff: ['view', 'create', 'edit'], roles: ['view'], settings: ['view'], 'audit-logs': ['view'] },
      ALL
    ),
  },
  {
    name: 'Assistant Controller',
    permissions: build(
      {
        ...forKeys(
          [groupKeys('Pre-exam'), groupKeys('Post-exam'), groupKeys('Result process'), groupKeys('Certificates & reports')],
          ['view', 'create', 'edit', 'verify']
        ),
      },
      ['view']
    ),
  },
  {
    name: 'Section Officer',
    permissions: build(
      {
        ...forKeys([groupKeys('Admission'), groupKeys('Base details'), groupKeys('Pre-exam')], ['view', 'create', 'edit']),
        ...forKeys([groupKeys('Administration')], []),
      },
      ['view']
    ),
  },
  {
    name: 'Data Entry Operator',
    permissions: build({
      dashboard: ['view'],
      students: ['view', 'create', 'edit'],
      'nominal-roll': ['view'],
      'attendance-marks': ['view', 'create', 'edit'],
      'external-marks': ['view', 'create', 'edit'],
    }),
  },
  {
    name: 'Evaluator',
    permissions: build({ dashboard: ['view'], 'external-marks': ['view', 'create', 'edit'] }),
  },
].map((r, i) => ({ ...r, order: i + 1 }));

// every module and action present, as true / false
const normalize = (permissions) =>
  Object.fromEntries(
    MODULE_KEYS.map((key) => [
      key,
      Object.fromEntries(ACTION_KEYS.map((a) => [a, permissions?.[key]?.[a] === true])),
    ])
  );

module.exports = {
  ACTIONS, ACTION_KEYS, MODULE_GROUPS, MODULE_KEYS, MODULE_NAME, DEFAULT_ROLES, normalize,
  blank: () => build({}),
};
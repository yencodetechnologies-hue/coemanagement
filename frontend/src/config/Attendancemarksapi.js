import API_BASE_URL from './api';

const BASE = `${API_BASE_URL}/api/attendance-marks`;
const LOCK = `${API_BASE_URL}/api/marks-lock`; // one verify / unlock for the whole batch (routes/marksLock.js)

async function handleResponse(response) {
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || 'Something went wrong');
  }
  return data;
}

// the marks-lock routes answer { success, data }: return the data part
async function handleLockResponse(response) {
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.success) {
    throw new Error(body?.message || 'Something went wrong');
  }
  return body.data;
}

const json = (method, body) => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body ?? {}),
});

// the four values that identify a batch lock
const lockParams = ({ instCode = '', course = '', batch = '', examYear = '' } = {}, extra = {}) =>
  new URLSearchParams({ instCode, course, batch, examYear, ...extra }).toString();

export const attendanceMarksApi = {
  batches: async ({ instCode = '', course = '' } = {}) => {
    const params = new URLSearchParams({ instCode, course });
    return handleResponse(await fetch(`${BASE}/batches?${params.toString()}`));
  },

  getSheet: async ({ instCode, course, batch, semester, subCode, subjectType, examYear, studentCategory }) => {
    const params = new URLSearchParams({ instCode, course, batch, semester, subCode, subjectType, examYear, studentCategory });
    return handleResponse(await fetch(`${BASE}/sheet?${params.toString()}`));
  },

  updateSheet: async (id, payload) =>
    handleResponse(await fetch(`${BASE}/sheet/${id}`, json('PUT', payload))),

  saveEntry: async (id, regNo, payload) =>
    handleResponse(await fetch(`${BASE}/sheet/${id}/entries/${encodeURIComponent(regNo)}`, json('PUT', payload))),

  // one sheet (kept for sheets that were verified one by one earlier)
  verify: async (id, payload) =>
    handleResponse(await fetch(`${BASE}/sheet/${id}/verify`, json('POST', payload))),

  unlock: async (id) =>
    handleResponse(await fetch(`${BASE}/sheet/${id}/unlock`, json('POST'))),

  /* ---------- the whole batch: every semester, subject, sheet type and student category ---------- */

  // { locked, lockedOn, lockedBy }
  lockStatus: async (scope) =>
    handleLockResponse(await fetch(`${LOCK}?${lockParams(scope)}`)),

  // lock status plus what is still missing: { students, subjects, semesters, incomplete: [{ semester, subCode, missing, total }] }
  lockCheck: async (scope) =>
    handleLockResponse(await fetch(`${LOCK}?${lockParams(scope, { check: 1 })}`)),

  // scope: { instCode, course, batch, examYear }
  verifyAll: async (scope) =>
    handleLockResponse(await fetch(`${LOCK}/verify`, json('POST', scope))),

  unlockAll: async (scope) =>
    handleLockResponse(await fetch(`${LOCK}/withdraw`, json('POST', scope))),
};
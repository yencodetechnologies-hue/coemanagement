// src/api/settingsApi.js  (put it next to your api.js)
import API_BASE_URL from './api';

const BASE = `${API_BASE_URL}/api/settings`;

async function request(path = '', options = {}) {
  const token = localStorage.getItem('token'); // only used if your login stores one
  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
  } catch {
    throw new Error('Cannot reach the server. Check that the backend is running.');
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.success === false) throw new Error(body.message || 'Request failed');
  return body.data;
}
const send = (method, body) => ({ method, body: body ? JSON.stringify(body) : undefined });
const enc = encodeURIComponent;

export const settingsApi = {
  get: () => request(),
  saveUniversity: (data) => request('/university', send('PUT', data)),
  saveGradingScale: (gradingScale) => request('/grading-scale', send('PUT', { gradingScale })),
  addSession: (name) => request('/sessions', send('POST', { name })),
  activateSession: (name) => request(`/sessions/${enc(name)}/activate`, send('PATCH')),
  deleteSession: (name) => request(`/sessions/${enc(name)}`, send('DELETE')),
  saveSerial: (n) => request('/serial', send('PUT', { nextGradeStatementSerial: n })),
};
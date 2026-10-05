import API_BASE_URL from './api';

const BASE = `${API_BASE_URL}/api/results`;

// ADAPT: read the login token the same way your other config files do
// (change the key if your app stores it under a different name).
const authHeaders = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

// Sends JSON properly (object -> JSON.stringify) and returns the `data` part of the response
const request = async (method, url, body) => {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: body == null ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success) {
    throw new Error(json?.message || `Request failed (${res.status})`);
  }
  return json.data;
};

const query = (obj) =>
  Object.entries(obj)
    .filter(([, v]) => v !== '' && v !== null && v !== undefined)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');

// { instCodes, courses, batches, semesters, examYears }
export const getResultOptions = (filters) => request('GET', `${BASE}/options?${query(filters)}`);

// { status, info, subjects, rows, stats, gradingScale, university, publishedOn }
export const getResults = (filters) => request('GET', `${BASE}?${query(filters)}`);

export const publishResults = (filters) => request('POST', `${BASE}/publish`, filters);
export const withdrawResults = (filters) => request('POST', `${BASE}/withdraw`, filters);
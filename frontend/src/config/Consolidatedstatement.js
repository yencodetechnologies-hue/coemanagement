import API_BASE_URL from './api';

const BASE = `${API_BASE_URL}/api/consolidated`;

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

// { instCodes, courses, batches, candidates: [{ regNo, name }] }
export const getConsolidatedOptions = (filters) => request('GET', `${BASE}/options?${query(filters)}`);

// { university, info, candidate, semesters, summary, serial }
export const getConsolidatedStatement = (filters) => request('GET', `${BASE}/statement?${query(filters)}`);

// takes the serial number from Settings; returns the statement with its serial
export const issueConsolidatedStatement = (filters) => request('POST', `${BASE}/issue`, filters);
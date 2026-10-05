import API_BASE_URL from './api';

const BASE = `${API_BASE_URL}/api/reports`;

// ADAPT: read the login token the same way your other config files do
// (change the key if your app stores it under a different name).
const authHeaders = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const query = (obj) =>
  Object.entries(obj)
    .filter(([, v]) => v !== '' && v !== null && v !== undefined)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');

// { resultStatus, passBySubject, gradeDistribution, attendance: { minimum, rows }, fee }
export const getReports = async (filters) => {
  const res = await fetch(`${BASE}?${query(filters)}`, {
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success) {
    throw new Error(json?.message || `Request failed (${res.status})`);
  }
  return json.data;
};
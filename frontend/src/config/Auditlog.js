import API_BASE_URL from './api';

const BASE = `${API_BASE_URL}/api/audit-logs`;

const get = async (url) => {
  const res = await fetch(url);
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

// { rows, total, page, limit, pages }
export const getAuditLogs = (params) => get(`${BASE}?${query(params)}`);

// { modules, actions, staff: [{ staffId, name, employeeId }] }
export const getAuditFilters = () => get(`${BASE}/filters`);
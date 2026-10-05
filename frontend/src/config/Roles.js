import API_BASE_URL from './api';

const BASE = `${API_BASE_URL}/api/roles`;

const request = async (method, url, body) => {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body == null ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success) {
    throw new Error(json?.message || `Request failed (${res.status})`);
  }
  return json.data;
};

// { actions, groups, roles: [{ _id, name, staffCount, staff, permissions }] }
export const getRoles = () => request('GET', BASE);

// permissions of the staff selected in the header: { role, permissions }
export const getMyPermissions = () => request('GET', `${BASE}/me`);

export const createRole = (name) => request('POST', BASE, { name });

// changes: [{ module, action, value }]   -> the updated role
export const updateRolePermissions = (id, changes) =>
  request('PATCH', `${BASE}/${id}/permissions`, { changes });

export const deleteRole = (id) => request('DELETE', `${BASE}/${id}`);
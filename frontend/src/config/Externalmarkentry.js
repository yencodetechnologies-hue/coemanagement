import API_BASE_URL from './api';

const BASE = `${API_BASE_URL}/api/external-marks`;

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

// [{ rebundleId, packetNo, label, scripts, entered, ... }]
export const fetchPackets = () => request('GET', `${BASE}/packets`);

// { label, min, max, rows: [{ sno, barcode, mark }] }
export const fetchPacket = (rebundleId, packetNo) =>
  request(
    'GET',
    `${BASE}/packet?rebundleId=${encodeURIComponent(rebundleId)}&packetNo=${encodeURIComponent(packetNo)}`
  );

// marks: [{ barcode, mark }]  (mark null clears it)
export const savePacketMarks = (rebundleId, packetNo, marks) =>
  request('PUT', `${BASE}/packet`, { rebundleId, packetNo, marks });
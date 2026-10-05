import API_BASE_URL from './api';

const BASE = `${API_BASE_URL}/api/dashboard`;

// { university, examYear, courses, course, groups, steps, stats, upcoming, pendingSheets, recent }
export const getDashboard = async ({ instCode = '', course = '', examYear = '' } = {}) => {
  const params = new URLSearchParams();
  if (instCode) params.set('instCode', instCode);
  if (course) params.set('course', course);
  if (examYear) params.set('examYear', examYear);

  const res = await fetch(`${BASE}?${params.toString()}`);
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success) {
    throw new Error(json?.message || `Request failed (${res.status})`);
  }
  return json.data;
};
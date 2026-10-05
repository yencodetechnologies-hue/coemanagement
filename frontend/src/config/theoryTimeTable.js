import { http } from './Http'; // sends Authorization: Bearer <token>

const qs = (params) => new URLSearchParams(params).toString();

export const fetchTTOptions = (params) => http(`/theory-timetable/options?${qs(params)}`);
export const fetchTTSubjects = (params) => http(`/theory-timetable/subjects?${qs(params)}`);
export const fetchSavedTT = (instCode) => http(`/theory-timetable/saved?${qs({ instCode })}`);
export const saveTT = (body) =>
  http('/theory-timetable', { method: 'PUT', body: JSON.stringify(body) });
export const deleteTT = (id) => http(`/theory-timetable/${id}`, { method: 'DELETE' });
import { http } from './Http'; // sends Authorization: Bearer <token>

const qs = (params) => new URLSearchParams(params).toString();

export const fetchAHOptions = () => http('/application/options');

export const fetchApplication = (filters) => http(`/application?${qs(filters)}`);

export const saveAppSettings = (body) =>
  http('/application/settings', { method: 'PUT', body: JSON.stringify(body) });

export const issueHallTickets = (body) =>
  http('/application/hall-tickets/issue', { method: 'POST', body: JSON.stringify(body) });
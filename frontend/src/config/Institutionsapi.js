// src/api/institutionsApi.js
import { http } from './Http';

export const institutionsApi = {
  list: ({ page, limit, search, status }) => {
    const q = new URLSearchParams({ page, limit });
    if (search) q.set('search', search);
    if (status) q.set('status', status);
    return http(`/institutions?${q}`);
  },
  create: (data) => http('/institutions', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => http(`/institutions/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  remove: (id) => http(`/institutions/${id}`, { method: 'DELETE' }),
};
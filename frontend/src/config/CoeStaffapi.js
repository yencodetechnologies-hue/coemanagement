import API_BASE_URL from './api';

const BASE = `${API_BASE_URL}/api/ceostaff`;

async function handleResponse(response) {
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || 'Something went wrong');
  }
  return data;
}

export const coeStaffApi = {
  list: async ({ page = 1, limit = 10, search = '', status = '' } = {}) => {
    const params = new URLSearchParams({ page, limit, search, status });
    const response = await fetch(`${BASE}?${params.toString()}`);
    return handleResponse(response);
  },

  getById: async (id) => {
    const response = await fetch(`${BASE}/${id}`);
    return handleResponse(response);
  },

  create: async (payload) => {
    const response = await fetch(BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return handleResponse(response);
  },

  update: async (id, payload) => {
    const response = await fetch(`${BASE}/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return handleResponse(response);
  },

  remove: async (id) => {
    const response = await fetch(`${BASE}/${id}`, {
      method: 'DELETE',
    });
    return handleResponse(response);
  },
};
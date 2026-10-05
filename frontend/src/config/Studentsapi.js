import API_BASE_URL from './api';

const BASE = `${API_BASE_URL}/api/students`;

async function handleResponse(response) {
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || 'Something went wrong');
  }
  return data;
}

export const studentsApi = {
  list: async ({ page = 1, limit = 10, search = '', status = '', instCode = '', batch = '' } = {}) => {
    const params = new URLSearchParams({ page, limit, search, status, instCode, batch });
    const response = await fetch(`${BASE}?${params.toString()}`);
    return handleResponse(response);
  },

  getById: async (id) => {
    const response = await fetch(`${BASE}/${id}`);
    return handleResponse(response);
  },

  create: async (formData) => {
    const response = await fetch(BASE, {
      method: 'POST',
      // Note: When sending FormData with files, do NOT set 'Content-Type', fetch sets it automatically with the boundary
      body: formData,
    });
    return handleResponse(response);
  },

  update: async (id, formData) => {
    const response = await fetch(`${BASE}/${id}`, {
      method: 'PUT',
      body: formData,
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
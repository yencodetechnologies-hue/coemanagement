import API_BASE_URL from './api';

export const getToken = () => localStorage.getItem('token');

export async function http(path, options = {}) {
  const token = getToken();
  let res;
  try {
    res = await fetch(`${API_BASE_URL}/api${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      },
    });
  } catch {
    throw new Error('Cannot reach the server. Check that the backend is running.');
  }

  const body = await res.json().catch(() => ({}));

  if (res.status === 401) {
    localStorage.removeItem('token');
    throw new Error(body.message || 'Session expired. Please log in again.');
  }
  if (!res.ok || body.success === false) throw new Error(body.message || 'Request failed');
  return body.data;
}

// Add this line to fix the Vite build error
export default http;
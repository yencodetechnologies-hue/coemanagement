import * as httpModule from '../config/Http';

// Your Http.js can export `http` (or a default export). This adapter works with the usual shapes:
//   1) axios-style object:   http.get(path) / http.post(path, body) / http.put(...) / http.delete(...)
//   2) helper function:      http(path, { method, body })
//   3) object with request:  http.request(path, { method, body })
const client = httpModule.http || httpModule.default;

export const request = async (method, path, body) => {
  const m = method.toLowerCase();

  if (client && typeof client[m] === 'function') {
    return m === 'get' || m === 'delete' ? client[m](path) : client[m](path, body);
  }
  if (typeof client === 'function') {
    return client(path, { method: method.toUpperCase(), body });
  }
  if (client && typeof client.request === 'function') {
    return client.request(path, { method: method.toUpperCase(), body });
  }
  throw new Error('Http helper not recognised. Open src/config/Http.js and adjust api/request.js');
};
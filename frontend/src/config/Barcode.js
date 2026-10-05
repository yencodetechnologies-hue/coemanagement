import { request } from './Request';

// If your http base URL does not already end with /api, use '/api/barcode'
const BASE = '/barcode';

// works whether the helper returns the axios response or the { success, data } body
export const unwrap = (res) => {
  const body = res?.data ?? res;
  return body && typeof body === 'object' && 'success' in body ? body.data : body;
};

export const errMsg = (e) => e?.response?.data?.message || e?.message || 'Something went wrong';

const qs = (obj) =>
  new URLSearchParams(Object.entries(obj).filter(([, v]) => v !== undefined && v !== null && v !== '')).toString();

export const getBarcodeOptions = async (filters) => unwrap(await request('GET', `${BASE}/options?${qs(filters)}`));

export const getBarcodeMapping = async (filters) => unwrap(await request('GET', `${BASE}/mapping?${qs(filters)}`));

export const generateBarcodes = async (filters) =>
  unwrap(await request('POST', `${BASE}/generate`, JSON.stringify(filters)));

export const verifyBarcodeMapping = async (id) => unwrap(await request('PUT', `${BASE}/${id}/verify`, JSON.stringify({})));

export const removeBarcodeMapping = async (id) => unwrap(await request('DELETE', `${BASE}/${id}`));
import { request } from './Request';
import { unwrap } from './Barcode';

// If your http base URL does not already end with /api, use '/api/rebundle'
const BASE = '/rebundle';

export const listPapers = async (examYear) =>
  unwrap(await request('GET', `${BASE}/papers${examYear ? `?examYear=${encodeURIComponent(examYear)}` : ''}`));

export const listEvaluators = async () => unwrap(await request('GET', `${BASE}/evaluators`));

export const getRebundle = async (mappingId) => unwrap(await request('GET', `${BASE}/${mappingId}`));

export const runRebundle = async (mappingId, packetSize) =>
  unwrap(await request('POST', BASE, JSON.stringify({ mappingId, packetSize })));

export const assignEvaluator = async (mappingId, packetNo, evaluatorId) =>
  unwrap(await request('PUT', `${BASE}/${mappingId}/packets/${packetNo}/evaluator`, { evaluatorId: evaluatorId || null }));
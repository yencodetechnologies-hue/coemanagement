import { http } from './Http';

export const fetchNominalFilters = () => http('/nominal-roll/filters');

export const fetchNominalRoll = (filters) => {
  const qs = new URLSearchParams(filters).toString();
  return http(`/nominal-roll?${qs}`);
};
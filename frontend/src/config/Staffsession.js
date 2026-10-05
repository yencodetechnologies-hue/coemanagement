// The staff selected in the header ("acting as"), kept in the browser, and sent to the
// server with every API request so the audit log knows who made each change.

const KEY = 'coe.currentStaff';
const EVENT = 'coe-staff-change';

export const getCurrentStaff = () => {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || null;
  } catch {
    return null;
  }
};

export const setCurrentStaff = (staff) => {
  if (staff) {
    const { _id, employeeId, fullName, designation, accessRole } = staff;
    localStorage.setItem(KEY, JSON.stringify({ _id, employeeId, fullName, designation, accessRole }));
  } else {
    localStorage.removeItem(KEY);
  }
  window.dispatchEvent(new Event(EVENT));
};

// call the listener whenever the selected staff changes; returns an "unsubscribe" function
export const onStaffChange = (listener) => {
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
};

// Adds the "x-staff-id" header to every request that goes to /api/.
// Done once, here, so none of the existing config files has to change.
if (typeof window !== 'undefined' && !window.__coeStaffHeader) {
  window.__coeStaffHeader = true;
  const originalFetch = window.fetch.bind(window);
  window.fetch = (input, init = {}) => {
    const url = typeof input === 'string' ? input : input?.url || '';
    const staff = getCurrentStaff();
    if (staff?._id && url.includes('/api/')) {
      const headers = new Headers(init.headers || (typeof input === 'string' ? undefined : input.headers));
      headers.set('x-staff-id', staff._id);
      return originalFetch(input, { ...init, headers });
    }
    return originalFetch(input, init);
  };
}
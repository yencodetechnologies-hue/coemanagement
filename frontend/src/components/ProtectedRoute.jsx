import { Navigate, Outlet, useLocation } from 'react-router-dom';

// Returns true only if an admin is logged in and the JWT has not expired
export function isAdminLoggedIn() {
  const token = localStorage.getItem('token');
  const admin = localStorage.getItem('admin');
  if (!token || !admin || admin === 'undefined') return false;

  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (payload.exp && payload.exp * 1000 < Date.now()) {
      logout();
      return false;
    }
  } catch {
    // Token is not a readable JWT; let the backend decide on the next API call
  }
  return true;
}

export function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('admin');
}

// Wrap pages that need an admin login
export default function ProtectedRoute({ children }) {
  const location = useLocation();
  if (!isAdminLoggedIn()) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return children ?? <Outlet />;
}

// Wrap the login page so a logged-in admin is sent to the dashboard
export function PublicOnlyRoute({ children }) {
  return isAdminLoggedIn() ? <Navigate to="/dashboard" replace /> : children;
}
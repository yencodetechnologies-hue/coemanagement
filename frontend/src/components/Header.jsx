// components/Header.jsx
import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Menu, ChevronDown, Contrast, Check } from 'lucide-react';
import { NAV_GROUPS } from './Sidebar';
import { coeStaffApi } from '../config/CoeStaffapi'; // ADAPT: the file that exports coeStaffApi
import './Header.css';

/* ------------------------------------------------------------------ *
 * Selected staff ("working as"). Kept in the browser and sent to the
 * server with every API request, so the audit log knows who made each
 * change. Everything is in this file: no separate staffSession.js needed.
 * ------------------------------------------------------------------ */
const STAFF_KEY = 'coe.currentStaff';

const getCurrentStaff = () => {
  try {
    return JSON.parse(localStorage.getItem(STAFF_KEY)) || null;
  } catch {
    return null;
  }
};

const setCurrentStaff = (staff) => {
  if (staff) {
    const { _id, employeeId, fullName, designation, accessRole } = staff;
    localStorage.setItem(STAFF_KEY, JSON.stringify({ _id, employeeId, fullName, designation, accessRole }));
  } else {
    localStorage.removeItem(STAFF_KEY);
  }
};

// Adds the "x-staff-id" header to every request that goes to /api/ (done once).
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

// "Dr. R. Meenakshi" -> "RM", "K. Arvind" -> "KA"
const initialsOf = (name) =>
  String(name || '')
    .split(/[\s.]+/)
    .filter((w) => w && !/^(dr|mr|mrs|ms|prof)$/i.test(w))
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('') || '?';

// the list endpoint may wrap its rows in different ways; take the first array found
const rowsOf = (res) => {
  const candidates = [
    res, res?.data, res?.data?.items, res?.data?.rows, res?.data?.docs, res?.data?.staff,
    res?.items, res?.rows, res?.docs, res?.staff,
  ];
  return candidates.find(Array.isArray) || [];
};

export default function Header({ onMenuClick, sessions, session, setSession, toggleTheme }) {
  const { pathname } = useLocation();
  const group = NAV_GROUPS.find((g) => g.items.some((i) => pathname.startsWith(i.path)));
  const item = group?.items.find((i) => pathname.startsWith(i.path));

  const [staffList, setStaffList] = useState([]);
  const [staff, setStaff] = useState(getCurrentStaff());
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const menuRef = useRef(null);

  // active staff from the database
  useEffect(() => {
    let alive = true;
    coeStaffApi
      .list({ page: 1, limit: 200, status: 'Active' })
      .then((res) => {
        if (!alive) return;
        const rows = rowsOf(res).filter((s) => !s.status || s.status === 'Active');
        setStaffList(rows);
        // keep the saved staff if still active (with fresh details), otherwise the first one
        const saved = getCurrentStaff();
        const current = rows.find((s) => s._id === saved?._id) || rows[0] || null;
        setCurrentStaff(current);
        setStaff(current);
      })
      .catch((e) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, []);

  // close the menu on outside click / Escape
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const choose = (s) => {
    setCurrentStaff(s);
    setStaff(s);
    setOpen(false);
  };

  return (
    <header className="main-header">
      <div className="header-left">
        <button className="icon-btn" onClick={onMenuClick} aria-label="Toggle menu">
          <Menu size={16} />
        </button>
        <p className="breadcrumb">
          {group?.label} / <strong>{item?.name}</strong>
        </p>
      </div>

      <div className="header-right">
        <label className="session-pill">
          <span>Exam session</span>
          <span className="select-wrap">
            <select value={session} onChange={(e) => setSession(e.target.value)}>
              {sessions.map((s) => <option key={s}>{s}</option>)}
            </select>
            <ChevronDown size={14} />
          </span>
        </label>
        <button className="icon-btn round" onClick={toggleTheme} aria-label="Toggle theme">
          <Contrast size={15} />
        </button>

        <div className="staff-menu-wrap" ref={menuRef}>
          <button
            className="user-chip"
            onClick={() => setOpen((o) => !o)}
            aria-haspopup="listbox"
            aria-expanded={open}
          >
            <span className="user-avatar">{initialsOf(staff?.fullName)}</span>
            <span className="user-name">
              {staff ? `${staff.fullName} (${staff.designation})` : 'Select staff'}
            </span>
            <ChevronDown size={16} />
          </button>

          {open && (
            <div className="staff-menu" role="listbox" aria-label="Staff">
              <p className="staff-menu-title">Working as</p>
              {error && <p className="staff-menu-empty">{error}</p>}
              {!error && staffList.length === 0 && <p className="staff-menu-empty">No active staff found.</p>}
              {staffList.map((s) => (
                <button
                  key={s._id}
                  className={`staff-option ${s._id === staff?._id ? 'current' : ''}`}
                  role="option"
                  aria-selected={s._id === staff?._id}
                  onClick={() => choose(s)}
                >
                  <span className="user-avatar">{initialsOf(s.fullName)}</span>
                  <span className="staff-option-text">
                    <b>{s.fullName}</b>
                    <small>{[s.designation, s.employeeId].filter(Boolean).join(' · ')}</small>
                  </span>
                  {s._id === staff?._id && <Check size={15} />}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
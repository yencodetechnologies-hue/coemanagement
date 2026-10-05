// components/Sidebar.jsx
import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutGrid, User, Landmark, BookOpen, Layers, ListChecks, CheckSquare,
  CalendarDays, Ticket, ScanLine, Package, LogOut, X,
  LineChart, FileText, Award, PieChart, Users, Shield, SlidersVertical, Clock,
} from 'lucide-react';

// One place that defines every menu item and its URL
export const NAV_GROUPS = [
  { label: 'Overview', items: [{ name: 'Dashboard', path: '/dashboard', icon: LayoutGrid }] },
  { label: 'Admission', items: [{ name: 'Student profile', path: '/students', icon: User }] },
  { label: 'Base details', items: [
    { name: 'Institutions', path: '/institute', icon: Landmark },
    { name: 'Course details', path: '/course', icon: BookOpen },
    { name: 'Curriculum master', path: '/curriculum-master', icon: Layers },
  ] },
  { label: 'Pre-exam', items: [
    { name: 'Student nominal roll', path: '/student-nominal-roll', icon: ListChecks },
    { name: 'Attendance & internal marks', path: '/attendance-internal-marks', icon: CheckSquare },
    { name: 'Theory time table', path: '/theory-time-table', icon: CalendarDays },
    { name: 'Application & hall ticket', path: '/application-hall-ticket', icon: Ticket },
  ] },
  { label: 'Post-exam', items: [
    { name: 'Bar code mapping', path: '/bar-code-mapping', icon: ScanLine },
    { name: 'Re-bundle', path: '/re-bundle', icon: Package },
    { name: 'External Mark Entry', path: '/mark-entry', icon: Package },
  ] },
  { label: 'Result process', items: [
    { name: 'Result processing', path: '/result-processing', icon: LineChart },
    { name: 'Semester grade statement', path: '/semester-grade-statement', icon: FileText },
    { name: 'Consolidated grade statement', path: '/consolidated-grade-statement', icon: Award },
  ] },
  { label: 'Certificates & reports', items: [
    { name: 'Provisional certificate', path: '/provisional-certificate', icon: Award },
    { name: 'Reports', path: '/reports', icon: PieChart },
  ] },
  { label: 'Administration', items: [
    { name: 'COE staff', path: '/coe-staff', icon: Users },
    { name: 'Roles & permissions', path: '/roles-permissions', icon: Shield },
    { name: 'Settings', path: '/settings', icon: SlidersVertical },
    { name: 'Audit log', path: '/audit-log', icon: Clock },
  ] },
];

export default function Sidebar({ sidebarOpen, setSidebarOpen, onLogout }) {
  const close = () => setSidebarOpen(false);
  return (
    <>
      {sidebarOpen && <div className="sidebar-backdrop" onClick={close} />}
      <aside className={`dashboard-sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <div className="logo-mark">COE</div>
            <div>
              <div className="logo-text">COE Console</div>
              <div className="logo-sub">Controller of Examinations</div>
            </div>
          </div>
          <button className="mobile-close-btn" onClick={close} aria-label="Close menu">
            <X size={20} />
          </button>
        </div>

        <nav className="sidebar-nav">
          {NAV_GROUPS.map((group) => (
            <div className="nav-group" key={group.label}>
              <p className="nav-group-label">{group.label}</p>
              {group.items.map(({ name, path, icon: Icon }) => (
                <NavLink
                  key={path}
                  to={path}
                  title={name}
                  className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                  onClick={close}
                >
                  <Icon size={18} strokeWidth={1.75} />
                  <span>{name}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <button className="nav-item logout-btn" title="Logout" onClick={onLogout}>
            <LogOut size={18} strokeWidth={1.75} />
            <span>Logout</span>
          </button>
        </div>
      </aside>
    </>
  );
}
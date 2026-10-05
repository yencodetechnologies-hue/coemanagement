// layouts/DashboardLayout.jsx  – sidebar + header stay fixed, the page changes with the URL
import React, { useEffect, useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import Header from '../components/Header';
import { settingsApi } from '../config/settingsApi';
import '../pages/dashboard.css';

const activeName = (s) => s?.sessions.find((x) => x.active)?.name || '';

export default function DashboardLayout() {
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [theme, setTheme] = useState('light');
  const [session, setSession] = useState('');
  const [settings, setSettings] = useState(null);
  const [settingsError, setSettingsError] = useState('');

  const loadSettings = () => {
    setSettingsError('');
    settingsApi.get()
      .then((s) => { setSettings(s); setSession((cur) => cur || activeName(s)); })
      .catch((e) => setSettingsError(e.message));
  };
  useEffect(loadSettings, []);

  // Keep the header dropdown in step when sessions change on the Settings page
  const updateSettings = (next) => {
    if (activeName(next) !== activeName(settings) || !next.sessions.some((s) => s.name === session)) {
      setSession(activeName(next));
    }
    setSettings(next);
  };

  const handleLogout = () => {
    localStorage.removeItem('token'); // TODO: call your logout API if you have one
    navigate('/login', { replace: true });
  };

  const handleMenuClick = () =>
    window.innerWidth <= 1024 ? setSidebarOpen(true) : setCollapsed((c) => !c);

  return (
    <div className={`dashboard-container ${collapsed ? 'collapsed' : ''}`} data-theme={theme}>
      <Sidebar sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} onLogout={handleLogout} />
      <main className="dashboard-main">
        <Header
          onMenuClick={handleMenuClick}
          sessions={settings?.sessions.map((s) => s.name) || []}
          session={session}
          setSession={setSession}
          toggleTheme={() => setTheme(theme === 'light' ? 'dark' : 'light')}
        />
        <div className="dashboard-content">
          <Outlet context={{ settings, settingsError, loadSettings, updateSettings, session }} />
        </div>
      </main>
    </div>
  );
}
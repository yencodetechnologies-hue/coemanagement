// Dashboard.jsx
import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Sidebar, { NAV_GROUPS } from '../components/Sidebar';
import Header from '../components/Header';
import SettingsPage from './Settings';
import Institutions from './Institutions';

// --- Corrected Import Paths Based on File Structure ---
import { settingsApi } from '../config/settingsApi'; 
import { attendanceMarksApi } from '../config/Attendancemarksapi'; 
import { fetchApplication } from '../config/applicationHallTicket'; 
import { fetchNominalRoll } from '../config/nominalRoll'; 
import { fetchSavedTT } from '../config/theoryTimeTable'; 
// ----------------------------------------------------

import API_BASE_URL from '../config/api';
import './dashboard.css';

/* ====================================================================
 * Dashboard home (shown for the "Dashboard" menu)
 * Every figure comes from GET /api/dashboard, so the numbers here always
 * agree with the Nominal roll, Attendance, Hall ticket and Bar code pages.
 * ==================================================================== */

const authHeaders = () => {
  try {
    const token = localStorage.getItem('token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
};

const getDashboard = async ({ instCode = '', course = '', examYear = '' } = {}) => {
  const params = new URLSearchParams();
  if (instCode) params.set('instCode', instCode);
  if (course) params.set('course', course);
  if (examYear) params.set('examYear', examYear);

  const res = await fetch(`${API_BASE_URL}/api/dashboard?${params.toString()}`, {
    headers: { Accept: 'application/json', ...authHeaders() },
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success) {
    throw new Error(json?.message || `Request failed (${res.status})`);
  }
  return json.data;
};

const pad = (n) => String(n).padStart(2, '0');

const formatDate = (d) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d || ''));
  return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
};

const formatDateTime = (d) => {
  const t = new Date(d);
  if (Number.isNaN(t.getTime())) return '';
  const h = t.getHours();
  return `${pad(t.getDate())}/${pad(t.getMonth() + 1)}/${String(t.getFullYear()).slice(2)}, ${h % 12 || 12}:${pad(t.getMinutes())} ${h < 12 ? 'am' : 'pm'}`;
};

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
};

const firstName = (fullName) => {
  const words = String(fullName || '')
    .split(/[\s.]+/)
    .filter((w) => w.length > 1 && !/^(dr|mr|mrs|ms|prof)$/i.test(w));
  return words[0] || '';
};

const currentStaff = () => {
  try {
    return JSON.parse(localStorage.getItem('coe.currentStaff')) || null;
  } catch {
    return null;
  }
};

const menuItem = (pattern) =>
  (NAV_GROUPS || []).flatMap((g) => g.items || []).find((i) => pattern.test(i.name || '')) || null;

const stepProgress = (s) => {
  const p = Number.isFinite(Number(s.progress))
    ? Number(s.progress)
    : Number(s.total) > 0 ? Number(s.done) / Number(s.total) : 0;
  return Math.max(0, Math.min(1, p));
};

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

function DashboardHome({ session, ready, onOpen, onSession }) {
  const [course, setCourse] = useState(''); 
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [switched, setSwitched] = useState(null); // { from, to } when the dashboard changed the session itself
  const firstLoad = useRef(true);

  useEffect(() => {
    if (!ready) return undefined;
    let alive = true;
    const [instCode = '', courseCode = ''] = course.split('|');
    setLoading(true);
    setError('');

    getDashboard({ instCode, course: courseCode, examYear: session })
      .then((d) => { if (alive) setData(d); })
      .catch((e) => { if (alive) setError(e.message); })
      .finally(() => { if (alive) setLoading(false); });
      
    return () => { alive = false; };
  }, [course, session, ready]);

  // The header starts on the session marked active in Settings. When that session has nothing
  // saved for the course but another one has (the time table, attendance and marks are saved
  // per exam session), the dashboard opens on the session that has the data. This happens only
  // once, when the page opens; after that the header selection is always respected.
  useEffect(() => {
    if (!data || !firstLoad.current) return;
    firstLoad.current = false;
    if (!data.hasData && data.suggestedSession && onSession) {
      setSwitched({ from: data.examYear, to: data.suggestedSession });
      onSession(data.suggestedSession);
    }
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  const emptySession = Boolean(data) && !loading && data.hasData === false;

  const name = firstName(currentStaff()?.fullName);
  const selected = data?.course ? `${data.course.instCode}|${data.course.courseCode}` : '';
  const stats = data?.stats || {};
  const steps = data?.steps || [];
  const groups = data?.groups || [];
  const upcoming = data?.upcoming || [];
  const pendingSheets = data?.pendingSheets || [];
  const marksSummary = data?.marksSummary || []; // attendance + internal marks of each batch of the session
  const recent = data?.recent || [];

  // 'verify': internal sheets are verified with "Verify & lock" on the attendance page.
  // 'entry' : that lock is not installed, so the sheets are counted as entered / not entered.
  const verifyMode = data?.internalMode === 'verify';

  const timetableItem = menuItem(/theory\s*time\s*table/i) || menuItem(/time\s*table/i);
  const marksItem = menuItem(/attendance|internal/i);
  const auditItem = menuItem(/audit/i);

  return (
    <div className="dh-page" aria-busy={loading}>
      <div className="dh-head">
        <div>
          <h1>{greeting()}{name ? `, ${name}` : ''}</h1>
          <p>
            {data?.university ? `${data.university}, examination cell. ` : ''}
            {data?.course
              ? `Tracking ${data.course.courseCode} for the ${data.examYear || session || 'current'} session.`
              : loading ? 'Loading…' : 'No course found.'}
          </p>
        </div>
        {data?.courses?.length > 0 && (
          <select
            className="dh-course"
            value={course || selected}
            onChange={(e) => setCourse(e.target.value)}
            aria-label="Course"
          >
            {data.courses.map((c) => (
              <option key={`${c.instCode}|${c.courseCode}`} value={`${c.instCode}|${c.courseCode}`}>
                {c.courseCode}
              </option>
            ))}
          </select>
        )}
      </div>

      {error && <p className="toast error">{error}</p>}

      {/* the session was changed to the one that has data */}
      {switched && data?.examYear === switched.to && data.hasData && (
        <p className="toast" style={{ background: 'color-mix(in srgb, var(--accent) 9%, transparent)', color: 'var(--text)' }}>
          Showing <b>{switched.to}</b>. {switched.from} has nothing saved for this course yet; the time table,
          attendance and marks are saved under {switched.to}. To open on {switched.to} every time, mark it as the
          active session in Settings.
        </p>
      )}

      {/* the selected session has no data, but another one has */}
      {emptySession && data.suggestedSession && (
        <p
          className="toast"
          style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', background: 'color-mix(in srgb, var(--accent) 9%, transparent)', color: 'var(--text)' }}
        >
          <span>
            Nothing is saved for <b>{data.examYear}</b> in this course. Data is available for{' '}
            <b>{(data.courseSessions || []).join(', ')}</b>.
          </span>
          {onSession && (
            <button type="button" className="btn" onClick={() => onSession(data.suggestedSession)}>
              Show {data.suggestedSession}
            </button>
          )}
        </p>
      )}

      <section className="dh-cycle">
        <h2>{data?.examYear || session || 'Examination'} examination cycle</h2>
        <p>
          {groups.length
            ? groups.map((g) => `Batch ${g.batch}, semester ${g.semester}`).join('; ')
            : loading ? 'Loading…' : 'No batches have entries for this session yet.'}
        </p>
        <ol className="dh-steps">
          {steps.map((s, i) => (
            <li key={s.key || i} className={s.complete ? 'done' : num(s.done) > 0 ? 'active' : ''}>
              <span className="dh-dot">{s.complete ? '✓' : i + 1}</span>
              <b>{s.label}</b>
              <small>{num(s.done)} of {num(s.total)} {s.unit}</small>
              <span className="dh-bar"><span style={{ width: `${Math.round(stepProgress(s) * 100)}%` }} /></span>
            </li>
          ))}
        </ol>
      </section>

      <div className="dh-stats">
        <div className="dh-stat">
          <span className="dh-stat-label">Students on roll</span>
          <span className="dh-stat-value">{num(stats.studentsOnRoll)}</span>
          <span className="dh-stat-note">
            {num(stats.totalStudents)} records in total
            {stats.sessionStudents !== undefined ? ` · ${num(stats.sessionStudents)} in this session` : ''}
          </span>
        </div>
        <div className="dh-stat">
          <span className="dh-stat-label">Subjects in curriculum</span>
          <span className="dh-stat-value">{num(stats.subjects)}</span>
          <span className="dh-stat-note">
            {data?.course?.courseCode || ''}{stats.regulation ? `, regulation ${stats.regulation}` : ''}
          </span>
        </div>
        <div className="dh-stat">
          <span className="dh-stat-label">Attendance &amp; internal sheets pending</span>
          <span className="dh-stat-value">{num(stats.sheetsPending)}</span>
          <span className="dh-stat-note">
            {num(stats.sheetsComplete)} of {num(stats.sheetsTotal)} sheets complete
            {verifyMode && stats.sessionBatches !== undefined
              ? ` · ${num(stats.verifiedBatches)} of ${num(stats.sessionBatches)} batches verified`
              : ''}
          </span>
        </div>
        <div className="dh-stat">
          <span className="dh-stat-label">COE staff</span>
          <span className="dh-stat-value">{num(stats.staff)}</span>
          <span className="dh-stat-note">{num(stats.roles)} access roles</span>
        </div>
      </div>

      <div className="dh-grid">
        <section className="dh-card">
          <div className="dh-card-head">
            <h3>Upcoming exams</h3>
            {timetableItem && (
              <button type="button" className="dh-link" onClick={() => onOpen(timetableItem)}>Time table</button>
            )}
          </div>
          <ul className="dh-list">
            {upcoming.length === 0 && (
              <li className="dh-empty">{loading ? 'Loading…' : 'No exams scheduled from today onwards.'}</li>
            )}
            {upcoming.map((u, i) => (
              <li key={`${u.subCode}-${u.component || ''}-${u.examDate}-${u.session}-${i}`}>
                <div>
                  <b>{u.subCode}{/practical|clinical/i.test(u.component || '') ? ' (Practical)' : ''}</b>
                  <small>{u.subName}</small>
                </div>
                <div className="r">
                  <span>{formatDate(u.examDate)}</span>
                  <small>Sem {u.semester}, {u.session}</small>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="dh-card">
          <div className="dh-card-head">
            <h3>Attendance &amp; internal marks</h3>
            {marksItem && (
              <button type="button" className="dh-link" onClick={() => onOpen(marksItem)}>Open</button>
            )}
          </div>
          <ul className="dh-list">
            {marksSummary.length === 0 && (
              <li className="dh-empty">{loading ? 'Loading…' : 'No batches have entries for this session yet.'}</li>
            )}

            {/* one line per batch: how much attendance and how many marks are entered, and whether it is verified */}
            {marksSummary.map((b) => (
              <li key={`${b.batch}-${b.semester}`}>
                <div>
                  <b>Batch {b.batch}, semester {b.semester}</b>
                  <small>
                    Attendance {num(b.attendanceEntered)} of {num(b.expected)} · Internal marks {num(b.marksEntered)} of {num(b.expected)}
                  </small>
                  <small>{num(b.sheetsComplete)} of {num(b.sheets)} sheets complete · {num(b.students)} students</small>
                </div>
                <div className="r">
                  {verifyMode ? (
                    <span className={`badge ${b.verified ? 'active' : 'inactive'}`}>{b.verified ? 'Verified' : 'Not verified'}</span>
                  ) : (
                    <span className={`badge ${num(b.sheetsComplete) >= num(b.sheets) && num(b.sheets) > 0 ? 'active' : 'inactive'}`}>
                      {num(b.sheetsComplete) >= num(b.sheets) && num(b.sheets) > 0 ? 'Complete' : 'In progress'}
                    </span>
                  )}
                </div>
              </li>
            ))}

            {/* the sheets that still need something */}
            {pendingSheets.map((s, i) => (
              <li key={`${s.batch}-${s.semester}-${s.subCode}-${s.subjectType || ''}-${i}`}>
                <div>
                  <b>{s.subCode}{s.subjectType ? ` (${s.subjectType})` : ''}</b>
                  <small>
                    Batch {s.batch}, semester {s.semester} · attendance {num(s.attendanceEntered)} of {num(s.total)} · marks {num(s.entered)} of {num(s.total)}
                  </small>
                </div>
                <div className="r">
                  <small>{s.complete === false ? 'Values missing' : 'To verify'}</small>
                </div>
              </li>
            ))}

            {marksSummary.length > 0 && pendingSheets.length === 0 && (
              <li className="dh-empty">
                {verifyMode
                  ? 'Every sheet has attendance and marks, and every batch is verified.'
                  : 'Every sheet has attendance and marks.'}
              </li>
            )}
          </ul>
        </section>

        <section className="dh-card">
          <div className="dh-card-head">
            <h3>Recent activity</h3>
            {auditItem && (
              <button type="button" className="dh-link" onClick={() => onOpen(auditItem)}>Audit log</button>
            )}
          </div>
          <ul className="dh-list">
            {recent.length === 0 && (
              <li className="dh-empty">{loading ? 'Loading…' : 'No activity recorded yet.'}</li>
            )}
            {recent.map((r, i) => (
              <li key={r._id || i}>
                <div>
                  <b>{r.title}{r.failed ? ' (failed)' : ''}</b>
                  <small>{r.detail}</small>
                </div>
                <div className="r">
                  <small>{r.staffName}</small>
                  <small>{formatDateTime(r.at)}</small>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

/* ====================================================================
 * Dynamic DataView: Replaces static sample data with live API fetches
 * ==================================================================== */
const sectionData = {
  'Student profile': {
    stats: [['Undergraduates', '4,200', '+12%', 1], ['Postgraduates', '1,223', '+5%', 1], ['Graduating batch', '980', 'Final year', 1]],
    columns: ['Register no.', 'Full name', 'Programme', 'Year', 'Advisor', 'Status'],
    rows: [['22CS1041', 'Jane Cooper', 'B.Tech IT', 'Year 3', 'Dr. Robert Fox', 'Active']],
  },
  'Attendance & internal marks': {
    stats: [['Average attendance', '91.4%', '+2.1%', 1], ['Internal marks average', '18.2 / 20', 'Stable', 1], ['Below 75%', '38', 'Needs review', 0]],
    columns: ['Student name', 'Subject', 'Classes attended', 'Attendance', 'Internal', 'Status'],
    rows: [['Jane Cooper', 'Full stack development', '45 / 48', '93.7%', '19 / 20', 'Active']],
  },
  'Application & hall ticket': {
    stats: [['Applications received', '5,100', 'Window closed', 1], ['Hall tickets downloaded', '4,820', '94%', 1], ['Pending print', '280', 'Send to press', 0]],
    columns: ['Ticket no.', 'Student name', 'Batch', 'Issued on', 'Verified by', 'Status'],
    rows: [['HT-501', 'Jane Cooper', 'Batch 2026-A', '20 Sep 2026', 'System', 'Active']],
  },
};

const fallback = (name) => ({
  stats: [['Records', '—', 'No data yet', 1], ['Pending', '—', 'Nothing to review', 1]],
  columns: ['Name', 'Detail', 'Updated', 'Status'], rows: [],
});

function DynamicDataView({ activeMenu, session }) {
  const [data, setData] = useState(() => ({
    title: activeMenu,
    ...(sectionData[activeMenu] || fallback(activeMenu))
  }));
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState('');

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setApiError('');

    const fetchLiveData = async () => {
      try {
        let res = null;
        
        if (activeMenu === 'Attendance & internal marks') {
          res = await attendanceMarksApi.batches();
        } else if (activeMenu === 'Application & hall ticket') {
          res = await fetchApplication({ session });
        } else if (activeMenu === 'Student profile' || activeMenu === 'Nominal roll') {
          res = await fetchNominalRoll({ session });
        } else if (/time\s*table/i.test(activeMenu)) {
          res = await fetchSavedTT('');
        }

        if (!alive) return;

        const items = res?.data?.items || res?.data || res || [];
        
        if (Array.isArray(items) && items.length > 0) {
          const columns = Object.keys(items[0]).filter(k => typeof items[0][k] !== 'object');
          const rows = items.map(item => columns.map(c => String(item[c] || '')));
          
          setData(prev => ({
            ...prev,
            columns: columns.map(c => c.charAt(0).toUpperCase() + c.slice(1).replace(/([A-Z])/g, ' $1')), 
            rows
          }));
        }
      } catch (err) {
        if (alive) setApiError('Showing sample data (Live fetch failed)');
      } finally {
        if (alive) setLoading(false);
      }
    };

    fetchLiveData();
    return () => { alive = false; };
  }, [activeMenu, session]);

  return (
    <>
      <div className="stats-grid">
        {data.stats.map(([label, value, note, good]) => (
          <div className="stat-card" key={label}>
            <p className="stat-label">{label}</p>
            <p className="stat-value">{value}</p>
            {note && <p className={`stat-note ${good ? 'good' : 'warn'}`}>{note}</p>}
          </div>
        ))}
      </div>

      <section className="card">
        <div className="card-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
             <h2 className="card-title">{data.title}</h2>
             {loading && <small style={{color: 'var(--text-muted)'}}>Syncing live data...</small>}
             {apiError && <small style={{color: 'var(--error)'}}>{apiError}</small>}
          </div>
          <input className="field search" placeholder="Search records" />
        </div>
        <div className="table-responsive">
          <table className="custom-table">
            <thead><tr>{data.columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
            <tbody style={{ opacity: loading ? 0.6 : 1 }}>
              {data.rows.length === 0 && (
                <tr><td colSpan={data.columns.length} className="empty">Nothing here yet. Records will appear once this session has data.</td></tr>
              )}
              {data.rows.map((row, i) => (
                <tr key={i}>
                  {row.map((cell, j) => (
                    <td key={j} data-label={data.columns[j]}>
                      {j === row.length - 1
                        ? <span className={`badge ${String(cell).toLowerCase().replace(/\s/g, '-')}`}>{cell}</span>
                        : j === 0 ? <strong>{cell}</strong> : cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [activeMenu, setActiveMenu] = useState('Dashboard');
  const [session, setSession] = useState('');
  const [settings, setSettings] = useState(null);
  const [settingsError, setSettingsError] = useState('');
  const [theme, setTheme] = useState('light');

  const activeName = (s) => s?.sessions.find((x) => x.active)?.name || '';

  const loadSettings = () => {
    setSettingsError('');
    settingsApi.get()
      .then((s) => { setSettings(s); setSession((cur) => cur || activeName(s)); })
      .catch((e) => setSettingsError(e.message));
  };
  useEffect(loadSettings, []);

  const updateSettings = (next) => {
    if (activeName(next) !== activeName(settings)) setSession(activeName(next));
    else if (!next.sessions.some((s) => s.name === session)) setSession(activeName(next));
    setSettings(next);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    window.location.href = '/login';
  };

  const handleMenuClick = () =>
    window.innerWidth <= 1024 ? setSidebarOpen(true) : setCollapsed((c) => !c);

  // sessions for the header dropdown: the ones in Settings, plus the selected one when it is not
  // in that list (a session that has data but was never added in Settings)
  const sessionOptions = [...new Set([...(settings?.sessions.map((s) => s.name) || []), session].filter(Boolean))];

  const openMenu = (item) => {
    setActiveMenu(item.name);
    if (item.path) navigate(item.path);
  };

  return (
    <div className={`dashboard-container ${collapsed ? 'collapsed' : ''}`} data-theme={theme}>
      <Sidebar sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} activeMenu={activeMenu} setActiveMenu={setActiveMenu} onLogout={handleLogout} />
      <main className="dashboard-main">
        <Header
          onMenuClick={handleMenuClick}
          activeMenu={activeMenu}
          sessions={sessionOptions}
          session={session}
          setSession={setSession}
          toggleTheme={() => setTheme(theme === 'light' ? 'dark' : 'light')}
        />
        <div className="dashboard-content">
          {activeMenu === 'Settings' ? (
            settings ? (
              <SettingsPage settings={settings} onChange={updateSettings} />
            ) : (
              <p className={`toast ${settingsError ? 'error' : ''}`}>
                {settingsError ? <>{settingsError} <button className="btn" onClick={loadSettings}>Retry</button></> : 'Loading settings…'}
              </p>
            )
          ) : activeMenu === 'Institutions' ? (
            <Institutions />
          ) : activeMenu === 'Dashboard' ? (
            <DashboardHome
              session={session}
              ready={Boolean(settings) || Boolean(settingsError)}
              onOpen={openMenu}
              onSession={setSession}
            />
          ) : (
            <DynamicDataView activeMenu={activeMenu} session={session} />
          )}
        </div>
      </main>
    </div>
  );
}
// pages/Settings.jsx
import React, { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { settingsApi } from '../config/settingsApi';

const UNI_FIELDS = [
  ['name', 'University name', 'span-3'],
  ['shortName', 'Short name', 'span-1'],
  ['recognition', 'Recognition line', 'span-4'],
  ['address', 'Address', 'span-4'],
  ['signatoryTitle', 'Signatory title', 'span-2'],
];

export default function SettingsPage({ settings, onChange }) {
  const [uni, setUni] = useState(settings.university);
  const [grades, setGrades] = useState(settings.gradingScale);
  const [serial, setSerial] = useState(settings.nextGradeStatementSerial);
  const [newSession, setNewSession] = useState('');
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState(null);

  // Re-sync the forms whenever the server returns fresh data
  useEffect(() => {
    setUni(settings.university);
    setGrades(settings.gradingScale);
    setSerial(settings.nextGradeStatementSerial);
  }, [settings]);

  useEffect(() => {
    if (!msg) return undefined;
    const t = setTimeout(() => setMsg(null), 4000);
    return () => clearTimeout(t);
  }, [msg]);

  const run = async (key, action, okText, after) => {
    setBusy(key);
    setMsg(null);
    try {
      onChange(await action());
      setMsg({ type: 'ok', text: okText });
      after?.();
    } catch (e) {
      setMsg({ type: 'error', text: e.message });
    } finally {
      setBusy('');
    }
  };

  const setGrade = (i, key, value) =>
    setGrades((rows) => rows.map((r, idx) => (idx === i ? { ...r, [key]: value } : r)));

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-sub">University details printed on every document, the grading scale, and examination sessions.</p>
        </div>
      </div>

      {msg && <p className={`toast ${msg.type}`} role="status">{msg.text}</p>}

      <section className="card">
        <h2 className="card-title">University</h2>
        <form className="form-body form-grid" onSubmit={(e) => { e.preventDefault(); run('uni', () => settingsApi.saveUniversity(uni), 'University details saved'); }}>
          {UNI_FIELDS.map(([key, label, span]) => (
            <label key={key} className={`form-label ${span}`}>
              {label}
              <input className="field" value={uni[key] || ''} onChange={(e) => setUni({ ...uni, [key]: e.target.value })} />
            </label>
          ))}
          <div className="form-actions span-4">
            <button className="btn btn-primary" disabled={busy === 'uni'}>{busy === 'uni' ? 'Saving…' : 'Save university'}</button>
          </div>
        </form>
      </section>

      <div className="two-col">
        <section className="card">
          <h2 className="card-title">Grading scale</h2>
          <div className="table-responsive">
            <table className="custom-table">
              <thead>
                <tr><th>Letter grade</th><th>Description</th><th className="num">Minimum %</th><th className="num">Grade point</th><th /></tr>
              </thead>
              <tbody>
                {grades.map((r, i) => (
                  <tr key={i}>
                    <td data-label="Letter grade"><input className="field tiny" value={r.grade} onChange={(e) => setGrade(i, 'grade', e.target.value)} /></td>
                    <td data-label="Description"><input className="field" value={r.description} onChange={(e) => setGrade(i, 'description', e.target.value)} /></td>
                    <td data-label="Minimum %" className="num"><input className="field small" inputMode="decimal" value={r.minPercent} onChange={(e) => setGrade(i, 'minPercent', e.target.value)} /></td>
                    <td data-label="Grade point" className="num"><input className="field small" inputMode="decimal" value={r.gradePoint} onChange={(e) => setGrade(i, 'gradePoint', e.target.value)} /></td>
                    <td className="num">
                      <button className="icon-only" aria-label={`Remove grade ${r.grade}`} onClick={() => setGrades(grades.filter((_, idx) => idx !== i))}><Trash2 size={15} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="form-actions split">
            <button className="btn" onClick={() => setGrades([...grades, { grade: '', description: '', minPercent: '', gradePoint: '' }])}><Plus size={14} /> Add grade</button>
            <button className="btn btn-primary" disabled={busy === 'grades'} onClick={() => run('grades', () => settingsApi.saveGradingScale(grades), 'Grading scale saved')}>
              {busy === 'grades' ? 'Saving…' : 'Save grading scale'}
            </button>
          </div>
        </section>

        <section className="card">
          <h2 className="card-title">Examination sessions</h2>
          <ul className="session-list">
            {settings.sessions.map((s) => (
              <li key={s.name}>
                <strong>{s.name}</strong>
                <span className="row-actions">
                  {s.active ? (
                    <span className="badge active-session">Active session</span>
                  ) : (
                    <>
                      <button className="btn" disabled={busy === s.name} onClick={() => run(s.name, () => settingsApi.activateSession(s.name), `${s.name} is now the active session`)}>Make active</button>
                      <button className="icon-only" aria-label={`Delete ${s.name}`} onClick={() => window.confirm(`Delete session ${s.name}?`) && run(s.name, () => settingsApi.deleteSession(s.name), `${s.name} deleted`)}><Trash2 size={15} /></button>
                    </>
                  )}
                </span>
              </li>
            ))}
          </ul>
          <form className="form-actions split" onSubmit={(e) => { e.preventDefault(); run('add', () => settingsApi.addSession(newSession), 'Session added', () => setNewSession('')); }}>
            <input className="field grow" placeholder="New session, e.g. MAR-2028" value={newSession} onChange={(e) => setNewSession(e.target.value)} />
            <button className="btn" disabled={!newSession.trim() || busy === 'add'}><Plus size={14} /> Add session</button>
          </form>
          <form className="serial-row" onSubmit={(e) => { e.preventDefault(); run('serial', () => settingsApi.saveSerial(Number(serial)), 'Serial number saved'); }}>
            <label htmlFor="serial">Next grade statement serial no.</label>
            <span className="row-actions">
              <input id="serial" className="field" inputMode="numeric" value={serial} onChange={(e) => setSerial(e.target.value)} />
              <button className="btn" disabled={busy === 'serial'}>Save</button>
            </span>
          </form>
        </section>
      </div>
    </>
  );
}
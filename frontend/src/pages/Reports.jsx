import { useCallback, useEffect, useState } from 'react';
import { getResultOptions } from '../config/Resultprocessing'; // same dropdown lists
import { getReports } from '../config/Reports';
import './Reports.css';

const ORDER = ['instCode', 'course', 'batch', 'semester', 'examYear'];
const EMPTY = { instCode: '', course: '', batch: '', semester: '', examYear: '' };
const NO_OPTIONS = { instCodes: [], courses: [], batches: [], semesters: [], examYears: [] };

const inr = (v) => `₹${Number(v || 0).toLocaleString('en-IN')}`;

// one horizontal bar: label, track, value
function Bar({ label, title, fraction, value }) {
  const width = `${Math.max(0, Math.min(1, fraction || 0)) * 100}%`;
  return (
    <div className="rep-bar" title={title}>
      <span className="rep-bar-label">{label}</span>
      <span className="rep-bar-track"><span className="rep-bar-fill" style={{ width }} /></span>
      <span className="rep-bar-value">{value}</span>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="rep-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export default function Reports() {
  const [filters, setFilters] = useState(EMPTY);
  const [options, setOptions] = useState(NO_OPTIONS);
  const [view, setView] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // cascading filters: load the lists, then select the first valid value of each
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const o = await getResultOptions(filters);
        if (!alive) return;
        setOptions({ ...NO_OPTIONS, ...o });
        const pick = (cur, list) => (list.includes(cur) ? cur : list[0] || '');
        const next = {
          instCode: pick(filters.instCode, o.instCodes || []),
          course: pick(filters.course, (o.courses || []).map((c) => c.courseCode)),
          batch: pick(filters.batch, o.batches || []),
          semester: pick(filters.semester, o.semesters || []),
          examYear: pick(filters.examYear, o.examYears || []),
        };
        if (JSON.stringify(next) !== JSON.stringify(filters)) setFilters(next);
      } catch (e) {
        if (alive) setError(e.message);
      }
    })();
    return () => {
      alive = false;
    };
  }, [filters]);

  const complete = ORDER.every((k) => filters[k]);

  const load = useCallback(async () => {
    if (!complete) {
      setView(null);
      return;
    }
    setLoading(true);
    setError('');
    try {
      setView(await getReports(filters));
    } catch (e) {
      setView(null);
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [filters, complete]);

  useEffect(() => {
    load();
  }, [load]);

  const setFilter = (key, value) =>
    setFilters((f) => {
      const next = { ...f, [key]: value };
      ORDER.slice(ORDER.indexOf(key) + 1).forEach((k) => {
        next[k] = ''; // reset the filters below
      });
      return next;
    });

  const pass = view?.passBySubject || [];
  const grades = view?.gradeDistribution || [];
  const maxGrade = Math.max(1, ...grades.map((g) => g.count));
  const shortage = view?.attendance?.rows || [];
  const minimum = view?.attendance?.minimum ?? 75;
  const fee = view?.fee || {};
  const noResult = view && !pass.some((s) => s.appeared > 0);
  const placeholder = loading ? 'Loading…' : complete ? '' : 'Select a batch and semester.';

  return (
    <div className="rep-page">
      <div className="rep-head">
        <h1>Reports</h1>
        <p>
          Subject-wise pass percentage, grade distribution, attendance shortage and examination fee
          collection.
        </p>
      </div>

      {error && <p className="rep-alert">{error}</p>}

      <section className="rep-card rep-filters">
        <Field label="Inst code">
          <select value={filters.instCode} onChange={(e) => setFilter('instCode', e.target.value)}>
            {options.instCodes.map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </Field>
        <Field label="Course code">
          <select value={filters.course} onChange={(e) => setFilter('course', e.target.value)}>
            {options.courses.map((c) => (
              <option key={c.courseCode} value={c.courseCode}>{c.courseCode}</option>
            ))}
          </select>
        </Field>
        <Field label="Batch">
          <select value={filters.batch} onChange={(e) => setFilter('batch', e.target.value)}>
            {options.batches.map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </Field>
        <Field label="Semester">
          <select value={filters.semester} onChange={(e) => setFilter('semester', e.target.value)}>
            {options.semesters.map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </Field>
        <Field label="Year of exam">
          <select value={filters.examYear} onChange={(e) => setFilter('examYear', e.target.value)}>
            {options.examYears.map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </Field>
        {view?.resultStatus === 'DRAFT' && (
          <span className="rep-note">Results are not published yet. Pass and grade figures are a live preview.</span>
        )}
      </section>

      <div className="rep-grid">
        {/* ---- 1. pass percentage ---- */}
        <section className="rep-card">
          <h3 className="rep-card-title">Subject-wise pass percentage</h3>
          <div className="rep-body rep-bars">
            {placeholder && <p className="rep-empty">{placeholder}</p>}
            {!placeholder && view?.resultMessage && <p className="rep-empty">{view.resultMessage}</p>}
            {!placeholder && !view?.resultMessage && noResult && (
              <p className="rep-empty">No evaluated results for this selection yet.</p>
            )}
            {!placeholder && !noResult &&
              pass.map((s) => (
                <Bar
                  key={s.label}
                  label={s.label}
                  title={`${s.name}: ${s.passed} of ${s.appeared} passed`}
                  fraction={(s.percent || 0) / 100}
                  value={s.percent === null ? '—' : `${s.percent}%`}
                />
              ))}
          </div>
        </section>

        {/* ---- 2. grade distribution ---- */}
        <section className="rep-card">
          <h3 className="rep-card-title">Grade distribution</h3>
          <div className="rep-body rep-bars">
            {placeholder && <p className="rep-empty">{placeholder}</p>}
            {!placeholder && view?.resultMessage && <p className="rep-empty">{view.resultMessage}</p>}
            {!placeholder && !view?.resultMessage &&
              grades.map((g) => (
                <Bar key={g.grade} label={g.grade} fraction={g.count / maxGrade} value={g.count} />
              ))}
          </div>
        </section>

        {/* ---- 3. attendance shortage ---- */}
        <section className="rep-card">
          <div className="rep-card-title rep-card-head">
            <h3>Attendance shortage (below {minimum}%)</h3>
            <span className={`rep-count ${shortage.length ? 'bad' : 'ok'}`}>{shortage.length}</span>
          </div>
          <div className="rep-table-wrap">
            <table className="rep-table">
              <thead>
                <tr>
                  <th>Register no</th>
                  <th>Name</th>
                  <th>Subject</th>
                  <th className="r">Attendance</th>
                </tr>
              </thead>
              <tbody>
                {placeholder ? (
                  <tr><td colSpan={4} className="rep-muted">{placeholder}</td></tr>
                ) : shortage.length === 0 ? (
                  <tr><td colSpan={4} className="rep-muted">No shortage in this semester.</td></tr>
                ) : (
                  shortage.map((r) => (
                    <tr key={`${r.regNo}-${r.subject}`}>
                      <td><b>{r.regNo}</b></td>
                      <td>{r.name}</td>
                      <td>{r.subject}</td>
                      <td className="r"><span className="rep-low">{r.attendance}%</span></td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* ---- 4. exam fee ---- */}
        <section className="rep-card">
          <h3 className="rep-card-title">Exam fee collection, {fee.examYear || filters.examYear || '—'}</h3>
          <div className="rep-body rep-tiles">
            <div className="rep-tile">
              <span className="rep-tile-label">Applications issued</span>
              <span className="rep-tile-value">{fee.applications ?? 0}</span>
            </div>
            <div className="rep-tile">
              <span className="rep-tile-label">Fees assessed</span>
              <span className="rep-tile-value">{inr(fee.feesAssessed)}</span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
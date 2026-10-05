import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  getConsolidatedOptions,
  getConsolidatedStatement,
  issueConsolidatedStatement,
} from '../config/Consolidatedstatement';
import './ConsolidatedGradeStatement.css';

const EMPTY = { instCode: '', course: '', batch: '', regNo: '' };
const ORDER = ['instCode', 'course', 'batch', 'regNo'];
const NO_OPTIONS = { instCodes: [], courses: [], batches: [], candidates: [] };

const fmt2 = (v) => (v === null || v === undefined ? '—' : Number(v).toFixed(2));
const trim2 = (v) => String(Math.round(Number(v || 0) * 100) / 100);

// yyyy-mm-dd, ISO date or dd/mm/yyyy -> dd-mm-yyyy
const formatDate = (d) => {
  if (!d) return '';
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d));
  if (iso) return `${iso[3]}-${iso[2]}-${iso[1]}`;
  const dt = new Date(d);
  if (!Number.isNaN(dt.getTime())) return dt.toLocaleDateString('en-GB').replace(/\//g, '-');
  return String(d).replace(/\//g, '-');
};

/* ---------- the A4 statement (used for the preview and for printing) ---------- */
function ConsolidatedSheet({ view }) {
  const u = view.university || {};
  const info = view.info || {};
  const c = view.candidate || {};
  const sum = view.summary || {};
  const serial = view.serial && view.serial.current ? view.serial : null;

  const all = view.semesters.flatMap((s) => s.subjects);
  const hasCollege = all.some((s) => s.college);
  const hasNotAdded = all.some((s) => !s.addedToSgpa);
  const hasShared = all.some((s) => s.shared);

  return (
    <div className="cg-sheet">
      <div className="cg-header">
        <div className="cg-logo">{u.shortName}</div>
        <div className="cg-head-text">
          <h1>{u.name}</h1>
          {u.recognition && <p>{u.recognition}</p>}
          {u.address && <p>{u.address}</p>}
        </div>
      </div>
      <h2 className="cg-title">GRADE STATEMENT</h2>
      <hr className="cg-rule" />

      {serial ? (
        <p className="cg-serial">Serial No. {serial.serialNo}</p>
      ) : (
        <p className="cg-serial pending">Serial no. is issued when printed</p>
      )}

      <div className="cg-box">
        <div className="cg-pair"><span>Course</span><em>{info.courseName}</em></div>
        <div className="cg-pair"><span>Register number</span><b>{c.regNo}</b></div>
        <div className="cg-pair"><span>Branch</span><em>{info.department}</em></div>
        <div className="cg-pair"><span>Month &amp; year</span><em>{sum.lastExamYear}</em></div>
        <div className="cg-pair"><span>Regulation</span><em>{info.regulation}</em></div>
        <div className="cg-pair"><span>Institution</span><em>{info.instName}</em></div>
        <div className="cg-pair"><span>Name of the candidate</span><b>{c.name}</b></div>
        <div className="cg-pair"><span>Date of birth</span><em>{formatDate(c.dob)}</em></div>
      </div>

      <table className="cg-table">
        <thead>
          <tr>
            <th style={{ width: '15%' }}>Subject code</th>
            <th>Name of the subject</th>
            <th style={{ width: '8%' }}>Credit</th>
            <th style={{ width: '8%' }}>Grade</th>
            <th style={{ width: '8%' }}>Grade point</th>
            <th style={{ width: '9%' }}>Credit points</th>
            <th style={{ width: '8%' }}>Result</th>
            <th style={{ width: '11%' }}>Month &amp; year</th>
          </tr>
        </thead>
        {view.semesters.map((sem) => (
          <tbody key={sem.term}>
            <tr className="cg-sem">
              <td colSpan={8}>
                <span>{sem.label.toUpperCase()}</span>
                <span>
                  Credits {sem.creditsEarned} / {sem.creditsRegistered}
                  &nbsp;&nbsp;·&nbsp;&nbsp;GPA {fmt2(sem.gpa)}
                </span>
              </td>
            </tr>
            {sem.subjects.map((s) => {
              let name = [s.name, s.name2].filter(Boolean).join(' & ');
              if (s.shared && !/\((theory|practical)\)/i.test(name)) {
                name += s.type === 'PRACTICAL' ? ' (Practical)' : ' (Theory)';
              }
              return (
                <tr key={s.key}>
                  <td>{s.college ? '*' : ''}{s.code}{s.code2 ? `-${s.code2}` : ''}</td>
                  <td>{name}</td>
                  <td className="c">
                    {s.shared ? (s.type === 'PRACTICAL' ? 'P-' : 'T-') : ''}{s.credit}{!s.addedToSgpa ? '†' : ''}
                  </td>
                  <td className="c"><b>{s.grade}</b></td>
                  <td className="c">{s.gradePoint}</td>
                  <td className="c">{s.addedToSgpa ? trim2(s.credit * s.gradePoint) : '–'}</td>
                  <td className="c"><b>{s.pass ? 'Pass' : s.absent ? 'Ab' : 'RA'}</b></td>
                  <td className="c">{s.examYear}</td>
                </tr>
              );
            })}
          </tbody>
        ))}
      </table>

      <p className="cg-note">
        {hasCollege && '* College exam. '}
        {hasNotAdded && '† Not added to GPA / CGPA. '}
        {hasShared && 'T – Theory, P – Practical. '}
        RA – Reappear, Ab – Absent. Credit points = credit × grade point.
      </p>

      <div className="cg-cgpa">
        <b>Computation of CGPA</b>
        <span>
          CGPA = Σ(C × G) ÷ Σ C = {trim2(sum.cgpaPoints)} ÷ {sum.cgpaCredits} = <b>{fmt2(sum.cgpa)}</b>
        </span>
        <span>
          Credits earned: <b>{sum.creditsEarned} / {sum.creditsRegistered}</b>
          &nbsp;&nbsp;&nbsp;Semesters: <b>{sum.semestersComplete} of {sum.totalSemesters}</b>
          {sum.arrears > 0 && (
            <>&nbsp;&nbsp;&nbsp;Semesters with RA: <b>{sum.arrears}</b></>
          )}
        </span>
      </div>

      <div className="cg-footer">
        <div className="cg-sign">
          <i>{serial ? formatDate(serial.issuedOn) : ''}</i>
          <span>Date of issue</span>
        </div>
        <div className="cg-sign">
          <i />
          <span>{u.signatoryTitle || 'Controller of Examinations'}</span>
        </div>
      </div>
    </div>
  );
}

function Field({ label, wide, children }) {
  return (
    <label className={`cg-field ${wide ? 'wide' : ''}`}>
      <span>{label}</span>
      {children}
    </label>
  );
}

export default function ConsolidatedGradeStatement() {
  const [filters, setFilters] = useState(EMPTY);
  const [options, setOptions] = useState(NO_OPTIONS);
  const [view, setView] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null); // { ok, text }

  // cascading filters: load the lists, then select the first valid value of each
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const o = await getConsolidatedOptions({
          instCode: filters.instCode, course: filters.course, batch: filters.batch,
        });
        if (!alive) return;
        setOptions({ ...NO_OPTIONS, ...o });
        const pick = (cur, list) => (list.includes(cur) ? cur : list[0] || '');
        const next = {
          instCode: pick(filters.instCode, o.instCodes || []),
          course: pick(filters.course, (o.courses || []).map((c) => c.courseCode)),
          batch: pick(filters.batch, o.batches || []),
          regNo: pick(filters.regNo, (o.candidates || []).map((c) => c.regNo)),
        };
        if (JSON.stringify(next) !== JSON.stringify(filters)) setFilters(next);
      } catch (e) {
        if (alive) setMsg({ ok: false, text: e.message });
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
    try {
      setView(await getConsolidatedStatement(filters));
    } catch (e) {
      setView(null);
      setMsg({ ok: false, text: e.message });
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

  const hasResults = !!view && view.semesters.length > 0;
  const sum = view?.summary || {};
  const serial = view?.serial || null;

  // take (or reuse) the serial number, then print exactly what was issued
  const onPrint = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const issued = await issueConsolidatedStatement(filters);
      setView(issued);
      setMsg({
        ok: true,
        text: issued.reused
          ? `Reprint of serial no. ${issued.serial.serialNo}.`
          : `Serial no. ${issued.serial.serialNo} issued.`,
      });
      setTimeout(() => window.print(), 300); // let the sheet render with its serial first
    } catch (e) {
      setMsg({ ok: false, text: e.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="cg-page">
      <div className="cg-head">
        <div>
          <h1>Consolidated grade statement</h1>
          <p>
            All semesters on one statement with credits, grade points, GPA per semester and the
            cumulative CGPA.
          </p>
        </div>
        <div className="cg-actions">
          <button
            type="button"
            className="cg-btn primary"
            onClick={onPrint}
            disabled={busy || loading || !hasResults}
          >
            {busy ? 'Issuing…' : 'Print & issue serial no.'}
          </button>
        </div>
      </div>

      {msg && <p className={`cg-alert ${msg.ok ? 'ok' : 'error'}`}>{msg.text}</p>}

      {/* ---- summary ---- */}
      <div className="cg-stats">
        <div className="cg-stat">
          <span className="cg-stat-label">CGPA</span>
          <span className="cg-stat-value">{fmt2(sum.cgpa)}</span>
          <span className="cg-stat-note">over {sum.cgpaCredits ?? 0} credits</span>
        </div>
        <div className="cg-stat">
          <span className="cg-stat-label">Credits earned</span>
          <span className="cg-stat-value">{sum.creditsEarned ?? 0}</span>
          <span className="cg-stat-note">of {sum.creditsRegistered ?? 0} registered</span>
        </div>
        <div className="cg-stat">
          <span className="cg-stat-label">Semesters complete</span>
          <span className="cg-stat-value">{sum.semestersComplete ?? 0} / {sum.totalSemesters ?? 0}</span>
          <span className="cg-stat-note">batch {filters.batch || '—'}</span>
        </div>
        <div className="cg-stat">
          <span className="cg-stat-label">Arrears</span>
          <span className="cg-stat-value">{sum.arrears ?? 0}</span>
          <span className="cg-stat-note">semesters with RA</span>
        </div>
      </div>

      <section className="cg-card">
        <div className="cg-filters">
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
          <Field label="Candidate" wide>
            <select
              value={filters.regNo}
              onChange={(e) => setFilter('regNo', e.target.value)}
              disabled={!options.candidates.length}
            >
              {!options.candidates.length && <option value="">No candidates</option>}
              {options.candidates.map((c) => (
                <option key={c.regNo} value={c.regNo}>{c.regNo} {c.name}</option>
              ))}
            </select>
          </Field>
        </div>

        {hasResults && (
          <div className="cg-status">
            {serial?.current ? (
              <>
                <span className="cg-pill ok">Issued</span>
                <span>
                  Serial no. {serial.serialNo} was issued on {formatDate(serial.issuedOn)}. Printing
                  again reuses this number.
                </span>
              </>
            ) : serial ? (
              <>
                <span className="cg-pill warn">Results changed</span>
                <span>
                  New results were published after serial no. {serial.serialNo} was issued. Printing
                  issues a new serial number.
                </span>
              </>
            ) : (
              <>
                <span className="cg-pill warn">Not issued</span>
                <span>The next serial number from Settings is taken when you print.</span>
              </>
            )}
          </div>
        )}

        <div className="cg-preview">
          {loading ? (
            <p className="cg-empty">Loading…</p>
          ) : hasResults ? (
            <ConsolidatedSheet view={view} />
          ) : (
            <p className="cg-empty">
              {complete
                ? 'No published results for this candidate yet. Publish the semester results in Result processing first.'
                : 'Select a candidate.'}
            </p>
          )}
        </div>
      </section>

      {/* printable copy (portal into <body>, hidden on screen) */}
      {createPortal(
        <div className="print-root cg-print">{hasResults && <ConsolidatedSheet view={view} />}</div>,
        document.body
      )}
    </div>
  );
}
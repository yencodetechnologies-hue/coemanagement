import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { getResultOptions, getResults } from '../config/Resultprocessing';
import './Semestergradesystem.css';

const ORDER = ['instCode', 'course', 'batch', 'semester', 'examYear'];
const EMPTY = { instCode: '', course: '', batch: '', semester: '', examYear: '' };
const NO_OPTIONS = { instCodes: [], courses: [], batches: [], semesters: [], examYears: [] };

const shortSemester = (s) => String(s || '').replace(/^semester\s*/i, '');
const fmtNo = (n) => (n ? String(n).padStart(6, '0') : '');
const show = (v) => (v === null || v === undefined || v === '' ? '' : v);
const trim2 = (v) => (v === null || v === undefined ? '' : String(Math.round(Number(v) * 100) / 100));

// yyyy-mm-dd, ISO date or dd/mm/yyyy -> dd-mm-yyyy
const formatDate = (d) => {
  if (!d) return '';
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d));
  if (iso) return `${iso[3]}-${iso[2]}-${iso[1]}`;
  return String(d).replace(/\//g, '-');
};

// the SGPA working shown under the table
const sgpaWorking = (subjects, row) => {
  if (!row.complete) return { text: 'SGPA = Σ(C × G) ÷ Σ C = ', result: 'pending' };
  const used = subjects
    .map((s, i) => ({ s, g: row.grades[i] }))
    .filter(({ s, g }) => s.addedToSgpa && g && g.state === 'DONE');
  if (!used.length) return { text: 'SGPA = Σ(C × G) ÷ Σ C = ', result: 'not applicable' };
  const points = used.reduce((sum, { s, g }) => sum + s.credit * g.gradePoint, 0);
  const credits = used.reduce((sum, { s }) => sum + s.credit, 0);
  return {
    text:
      `SGPA = Σ(C × G) ÷ Σ C = (${used.map(({ s, g }) => `${s.credit}×${g.gradePoint}`).join(' + ')})` +
      ` ÷ (${used.map(({ s }) => s.credit).join(' + ')}) = ${trim2(points)} ÷ ${credits} = `,
    result: Number(row.sgpa).toFixed(2),
  };
};

/* ---------- one A4 statement (used for the preview and for printing) ---------- */
function StatementSheet({ view, filters, row }) {
  const u = view.university || {};
  const info = view.info || {};
  const published = view.status === 'PUBLISHED';
  const working = sgpaWorking(view.subjects, row);

  // only the subjects this candidate is registered for
  const lines = view.subjects
    .map((s, i) => ({ s, g: row.grades[i] }))
    .filter(({ g }) => g && g.state !== 'NA');

  const hasCollege = lines.some(({ s }) => s.college);
  const hasNotAdded = lines.some(({ s }) => !s.addedToSgpa);
  const hasShared = lines.some(({ s }) => s.shared);
  const pendingLines = lines.filter(({ g }) => g.state === 'PENDING');

  return (
    <div className="gs-sheet">
      <div className="gs-header">
        <div className="gs-logo">{u.shortName}</div>
        <div className="gs-head-text">
          <h1>{u.name}</h1>
          {u.recognition && <p>{u.recognition}</p>}
          {u.address && <p>{u.address}</p>}
        </div>
      </div>
      <h2 className="gs-title">GRADE STATEMENT</h2>
      <hr className="gs-rule" />

      {published ? (
        <p className="gs-serial">Statement no: <b>{fmtNo(row.statementNo)}</b></p>
      ) : (
        <p className="gs-serial draft">DRAFT - NOT PUBLISHED</p>
      )}

      <div className="gs-box">
        <div className="gs-pair"><span>Course</span><b>{info.courseName || filters.course}</b></div>
        <div className="gs-pair"><span>Register number</span><b>{row.regNo}</b></div>
        <div className="gs-pair"><span>Branch</span><em>{info.department}</em></div>
        <div className="gs-pair"><span>Month &amp; year</span><em>{filters.examYear}</em></div>
        <div className="gs-pair"><span>Regulation</span><em>{info.regulation}</em></div>
        <div className="gs-pair"><span>Semester</span><b>{shortSemester(filters.semester)} SEMESTER</b></div>
        <div className="gs-pair wide"><span>Institute</span><em>{info.instName}</em></div>
        <div className="gs-pair"><span>Name of the candidate</span><b>{row.name}</b></div>
        <div className="gs-pair"><span>Date of birth</span><em>{formatDate(row.dob)}</em></div>
      </div>

      <table className="gs-table">
        <thead>
          <tr>
            <th rowSpan={2} style={{ width: '4%' }}>S.No</th>
            <th rowSpan={2} style={{ width: '10.5%' }}>Subject code</th>
            <th rowSpan={2} style={{ width: '14%' }}>Name of the subject</th>
            <th colSpan={3}>Internal assessment</th>
            <th colSpan={3}>End sem college / university exam</th>
            <th rowSpan={2} style={{ width: '6%' }}>Total marks</th>
            <th rowSpan={2} style={{ width: '6%' }}>Final mark %</th>
            <th rowSpan={2} style={{ width: '6%' }}>Credit</th>
            <th rowSpan={2} style={{ width: '6%' }}>Grade</th>
            <th rowSpan={2} style={{ width: '6%' }}>Grade point</th>
            <th rowSpan={2} style={{ width: '7%' }}>Result</th>
          </tr>
          <tr>
            <th style={{ width: '4.5%' }}>Min</th>
            <th style={{ width: '4.5%' }}>Max</th>
            <th style={{ width: '8%' }}>Awarded</th>
            <th style={{ width: '4.5%' }}>Min</th>
            <th style={{ width: '4.5%' }}>Max</th>
            <th style={{ width: '8%' }}>Awarded</th>
          </tr>
        </thead>
        <tbody>
          {lines.map(({ s, g }, n) => {
            const done = g.state === 'DONE';
            const hasInt = s.internalMax > 0;
            const hasExt = s.externalMax > 0;
            const code = `${s.college ? '*' : ''}${s.code}${s.code2 ? `-${s.code2}` : ''}`;
            let name = [s.name, s.name2].filter(Boolean).join(' & ');
            if (s.shared && !/\((theory|practical)\)/i.test(name)) {
              name += s.type === 'PRACTICAL' ? ' (Practical)' : ' (Theory)';
            }
            const credit = `${s.shared ? (s.type === 'PRACTICAL' ? 'P-' : 'T-') : ''}${s.credit}`;
            const total = done && g.total !== null && g.total !== undefined ? g.total : null;
            const percent =
              total === null ? '' : trim2(g.percent ?? (g.max ? (total / g.max) * 100 : 0));
            return (
              <tr key={s.key || `${s.code}-${n}`}>
                <td className="c">{n + 1}</td>
                <td>{code}</td>
                <td>{name}</td>
                <td className="c">{hasInt ? s.internalMin : ''}</td>
                <td className="c">{hasInt ? s.internalMax : ''}</td>
                <td className="c"><b>{hasInt ? show(g.internal) : ''}</b></td>
                <td className="c">{hasExt ? s.externalMin : ''}</td>
                <td className="c">{hasExt ? s.externalMax : ''}</td>
                <td className="c"><b>{hasExt ? (g.absent ? 'Ab' : show(g.external)) : ''}</b></td>
                <td className="c">{show(total)}</td>
                <td className="c">{percent}</td>
                <td className="c">{credit}{!s.addedToSgpa ? '†' : ''}</td>
                <td className="c"><b>{done ? (g.absent ? 'Ab' : g.grade) : ''}</b></td>
                <td className="c">{done ? g.gradePoint : ''}</td>
                {/* a subject whose marks are not entered yet is listed too, as Pending (draft only) */}
                <td className="c"><b>{done ? (g.pass ? 'Pass' : g.absent ? 'Ab' : 'RA') : 'Pending'}</b></td>
              </tr>
            );
          })}
          {lines.length === 0 && (
            <tr><td colSpan={15} className="c">No subjects registered for this examination.</td></tr>
          )}
        </tbody>
      </table>

      <p className="gs-note">
        {hasCollege && '* College exam. '}
        {hasNotAdded && '† Not added to SGPA. '}
        {hasShared && 'T – Theory, P – Practical. '}
        RA – Reappear, Ab – Absent.
        {pendingLines.length > 0 &&
          ` Pending – marks not entered yet (${pendingLines.map(({ s, g }) => `${s.label || s.code}: ${String(g.reason || 'mark pending').toLowerCase()}`).join('; ')}).`}
      </p>

      <div className="gs-sgpa">
        <b>Computation of SGPA</b>
        <span>
          {working.text}
          <b>{working.result}</b>
        </span>
        {row.complete && (
          <span>
            Credits earned: <b>{row.creditsEarned} / {row.creditsTotal}</b>
            &nbsp;&nbsp;&nbsp;Result: <b>{row.result === 'Pass' ? 'PASS' : 'REAPPEAR (RA)'}</b>
          </span>
        )}
      </div>

      <div className="gs-footer">
        <div className="gs-sign">
          <i>{published ? formatDate(view.publishedOn) : ''}</i>
          <span>Date of issue</span>
        </div>
        <div className="gs-sign">
          <i />
          <span>{u.signatoryTitle || 'Controller of Examinations'}</span>
        </div>
      </div>
    </div>
  );
}

function Field({ label, wide, children }) {
  return (
    <label className={`gs-field ${wide ? 'wide' : ''}`}>
      <span>{label}</span>
      {children}
    </label>
  );
}

export default function SemesterGradeStatement() {
  const [filters, setFilters] = useState(EMPTY);
  const [options, setOptions] = useState(NO_OPTIONS);
  const [view, setView] = useState(null);
  const [regNo, setRegNo] = useState('');
  const [loading, setLoading] = useState(false);
  const [printMode, setPrintMode] = useState(null); // 'one' | 'batch'
  const [msg, setMsg] = useState(null);

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
        if (alive) setMsg(e.message);
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
    setMsg(null);
    try {
      const data = await getResults(filters);
      setView(data);
      setRegNo((cur) => (data.rows.some((r) => r.regNo === cur) ? cur : data.rows[0]?.regNo || ''));
    } catch (e) {
      setView(null);
      setMsg(e.message);
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

  const rows = view?.rows || [];
  const row = rows.find((r) => r.regNo === regNo) || null;
  const published = view?.status === 'PUBLISHED';

  const printNow = (mode) => {
    setPrintMode(mode);
    setTimeout(() => window.print(), 300); // let the print sheets render first
  };

  const printRows = printMode === 'batch' ? rows : printMode === 'one' && row ? [row] : [];

  return (
    <div className="gs-page">
      <div className="gs-head">
        <div>
          <h1>Semester grade statement</h1>
          <p>
            The per-semester mark sheet in the university format, with the SGPA computation printed
            underneath.
          </p>
        </div>
        <div className="gs-actions">
          <button type="button" className="gs-btn outline" onClick={() => printNow('batch')} disabled={!rows.length}>
            Print whole batch
          </button>
          <button type="button" className="gs-btn primary" onClick={() => printNow('one')} disabled={!row}>
            Print
          </button>
        </div>
      </div>

      {msg && <p className="gs-alert">{msg}</p>}

      <section className="gs-card">
        <div className="gs-filters">
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
          <Field label="Candidate" wide>
            <select value={regNo} onChange={(e) => setRegNo(e.target.value)} disabled={!rows.length}>
              {!rows.length && <option value="">No candidates</option>}
              {rows.map((r) => (
                <option key={r.regNo} value={r.regNo}>{r.regNo} {r.name}</option>
              ))}
            </select>
          </Field>
        </div>

        {view && (
          <div className="gs-status">
            {published ? (
              <>
                <span className="gs-pill ok">Published</span>
                <span>
                  Results were published on {formatDate(view.publishedOn)}.
                  {row ? ` Statement no ${fmtNo(row.statementNo)}.` : ''}
                </span>
              </>
            ) : (
              <>
                <span className="gs-pill draft">Draft</span>
                <span>
                  Results for this semester are not published yet, so this statement is for internal
                  checking only.
                </span>
              </>
            )}
          </div>
        )}

        <div className="gs-preview">
          {loading ? (
            <p className="gs-empty">Loading…</p>
          ) : row ? (
            <StatementSheet view={view} filters={filters} row={row} />
          ) : (
            <p className="gs-empty">
              No candidates found. Statements appear once attendance and marks are entered for this
              selection.
            </p>
          )}
        </div>
      </section>

      {/* printable copies (portal into <body>, hidden on screen) */}
      {createPortal(
        <div className="print-root gs-print">
          {view &&
            printRows.map((r) => <StatementSheet key={r.regNo} view={view} filters={filters} row={r} />)}
        </div>,
        document.body
      )}
    </div>
  );
}
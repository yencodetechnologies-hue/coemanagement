import { useCallback, useEffect, useState } from 'react';
import {
  getResultOptions,
  getResults,
  publishResults,
  withdrawResults,
} from '../config/Resultprocessing';
import './ResultProcessing.css';

const ORDER = ['instCode', 'course', 'batch', 'semester', 'examYear'];
const EMPTY = { instCode: '', course: '', batch: '', semester: '', examYear: '' };
const NO_OPTIONS = { instCodes: [], courses: [], batches: [], semesters: [], examYears: [] };

const shortSemester = (s) => String(s || '').replace(/^semester\s*/i, '');
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-GB').replace(/\//g, '-') : '');
const fmtSgpa = (v) => (v === null || v === undefined ? '—' : Number(v).toFixed(2));
const fmtNo = (n) => (n ? String(n).padStart(6, '0') : '');
const esc = (s) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// what one grade cell shows
const cellOf = (g) => {
  if (!g || g.state === 'NA') return { text: '–', tone: 'na', tip: 'Not registered for this subject' };
  if (g.state === 'PENDING') return { text: '…', tone: 'pending', tip: g.reason || 'Mark pending' };
  const parts = [];
  if (g.absent) parts.push('Absent');
  if (g.internal !== null && g.internal !== undefined) parts.push(`Internal ${g.internal}`);
  if (g.external !== null && g.external !== undefined) parts.push(`External ${g.external}`);
  if (g.total !== null && g.total !== undefined) parts.push(`Total ${g.total}/${g.max}`);
  return { text: g.grade, tone: g.pass ? 'ok' : 'fail', tip: parts.join(' · ') };
};

const openPrint = (title, style, body) => {
  const w = window.open('', '_blank', 'width=1000,height=1000');
  if (!w) {
    alert('Please allow pop-ups to print.');
    return;
  }
  w.document.write(
    `<!doctype html><html><head><title>${esc(title)}</title><style>${style}</style></head><body>${body}</body></html>`
  );
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 300);
};

const PRINT_BASE = `
  body{font-family:Georgia,'Times New Roman',serif;margin:28px;color:#111}
  h1{text-align:center;font-size:20px;margin:0}
  .sub{text-align:center;font-size:12px;margin:2px 0}
  h2{text-align:center;font-size:15px;margin:10px 0 2px}
  h3{text-align:center;font-size:14px;margin:12px 0 12px;letter-spacing:.04em}
  .box{border:1px solid #111;padding:8px 12px;display:grid;grid-template-columns:1fr 1fr;gap:4px 24px;font-size:13px;margin-bottom:14px}
  table{width:100%;border-collapse:collapse;font-size:12.5px}
  th,td{border:1px solid #111;padding:5px 7px;text-align:left}
  th{background:#f1f1f1}.c{text-align:center}
  .sum{margin-top:12px;display:flex;gap:28px;font-size:13px}
  .foot{margin-top:64px;display:flex;justify-content:space-between;font-size:13px}
  .note{margin-top:14px;font-size:11px}
`;

const letterhead = (view) => {
  const u = view.university || {};
  return `
    <h1>${esc(u.name || '')}</h1>
    ${u.recognition ? `<p class="sub">${esc(u.recognition)}</p>` : ''}
    ${u.address ? `<p class="sub">${esc(u.address)}</p>` : ''}
    <h2>${esc(view.info?.instName || '')}</h2>`;
};

// consolidated sheet for the controller of examinations
function printSheet(view, filters) {
  const i = view.info || {};
  const head = view.subjects.map((s) => `<th class="c">${esc(s.label || s.code)}</th>`).join('');
  const rows = view.rows
    .map(
      (r, n) => `<tr><td class="c">${n + 1}</td><td>${esc(r.regNo)}</td><td>${esc(r.name)}</td>${r.grades
        .map((g) => `<td class="c">${esc(cellOf(g).text)}</td>`)
        .join('')}<td class="c">${r.creditsEarned}/${r.creditsTotal}</td><td class="c">${fmtSgpa(r.sgpa)}</td><td class="c">${esc(r.result)}</td></tr>`
    )
    .join('');
  const st = view.stats || {};
  openPrint(
    'Result sheet',
    `${PRINT_BASE}@page{size:A4 landscape;margin:12mm}`,
    `${letterhead(view)}
    <h3>RESULT SHEET - ${esc(filters.examYear)}${view.status === 'PUBLISHED' ? '' : ' (DRAFT - NOT PUBLISHED)'}</h3>
    <div class="box">
      <div><b>Course:</b> ${esc(i.courseName || filters.course)}</div><div><b>Batch:</b> ${esc(filters.batch)}</div>
      <div><b>Semester:</b> ${esc(shortSemester(filters.semester))}</div><div><b>Regulation:</b> ${esc(i.regulation)}</div>
      <div><b>Candidates:</b> ${st.candidates ?? 0}</div><div><b>Passed all subjects:</b> ${st.passed ?? 0} (${st.passRate ?? 0}%)</div>
    </div>
    <table><thead><tr><th class="c">S.No</th><th>Register no</th><th>Name</th>${head}<th class="c">Credits</th><th class="c">SGPA</th><th class="c">Result</th></tr></thead><tbody>${rows}</tbody></table>
    <p class="note">RA = reappear. AB = absent. "–" = not registered for the subject.</p>
    <div class="foot"><span>Prepared by</span><span>${esc(view.university?.signatoryTitle || 'Controller of Examinations')}</span></div>`
  );
}

// grade statement of one candidate
function printStatement(view, filters, r) {
  const i = view.info || {};
  let n = 0;
  const rows = view.subjects
    .map((s, idx) => {
      const g = r.grades[idx];
      if (!g || g.state !== 'DONE') return '';
      n += 1;
      const name =
        [s.name, s.name2].filter(Boolean).join(' & ') +
        (s.shared ? (s.type === 'PRACTICAL' ? ' (Practical)' : ' (Theory)') : '');
      const code = s.code2 ? `${s.code} / ${s.code2}` : s.code;
      return `<tr><td class="c">${n}</td><td>${esc(code)}</td><td>${esc(name)}</td><td class="c">${s.credit}</td><td class="c">${esc(g.grade)}</td><td class="c">${g.gradePoint}</td><td class="c">${g.pass ? 'Pass' : g.absent ? 'Absent' : 'RA'}</td></tr>`;
    })
    .join('');
  const scale = (view.gradingScale || [])
    .map((g) => `${esc(g.grade)} = ${g.gradePoint} (${g.minPercent}% and above)`)
    .join(', ');
  openPrint(
    `Grade statement ${r.regNo}`,
    `${PRINT_BASE}@page{size:A4 portrait;margin:14mm}`,
    `${letterhead(view)}
    <h3>STATEMENT OF GRADES - ${esc(filters.examYear)}</h3>
    <div class="box">
      <div><b>Statement no:</b> ${esc(fmtNo(r.statementNo))}</div><div><b>Date:</b> ${esc(fmtDate(view.publishedOn))}</div>
      <div><b>Register no:</b> ${esc(r.regNo)}</div><div><b>Name:</b> ${esc(r.name)}</div>
      <div><b>Course:</b> ${esc(i.courseName || filters.course)}</div><div><b>Batch:</b> ${esc(filters.batch)}</div>
      <div><b>Semester:</b> ${esc(shortSemester(filters.semester))}</div><div><b>Regulation:</b> ${esc(i.regulation)}</div>
    </div>
    <table><thead><tr><th class="c" style="width:7%">S.No</th><th style="width:20%">Subject code</th><th>Subject name</th><th class="c" style="width:9%">Credits</th><th class="c" style="width:9%">Grade</th><th class="c" style="width:11%">Grade point</th><th class="c" style="width:10%">Result</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="sum"><span><b>Credits earned:</b> ${r.creditsEarned} / ${r.creditsTotal}</span><span><b>SGPA:</b> ${fmtSgpa(r.sgpa)}</span><span><b>Result:</b> ${r.result === 'Pass' ? 'PASS' : 'REAPPEAR (RA)'}</span></div>
    <p class="note">Grade points: ${scale}. SGPA = &Sigma;(credit &times; grade point) &divide; &Sigma; credits, counting only subjects added to SGPA.</p>
    <div class="foot"><span></span><span>${esc(view.university?.signatoryTitle || 'Controller of Examinations')}</span></div>`
  );
}

function Field({ label, children }) {
  return (
    <label className="rp-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export default function ResultProcessing() {
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
      setView(await getResults(filters));
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

  const run = async (fn, okText) => {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      await load();
      setMsg({ ok: true, text: okText });
    } catch (e) {
      setMsg({ ok: false, text: e.message });
    } finally {
      setBusy(false);
    }
  };

  const onPublish = () => {
    if (!window.confirm('Publish these results? Grades are frozen and statement numbers are issued.')) return;
    run(() => publishResults(filters), 'Results published.');
  };

  const onWithdraw = () => {
    if (!window.confirm('Withdraw these results? Statements cannot be printed until they are published again.')) return;
    run(() => withdrawResults(filters), 'Results withdrawn.');
  };

  const info = view?.info || {};
  const subjects = view?.subjects || [];
  const rows = view?.rows || [];
  const stats = view?.stats || {};
  const scale = view?.gradingScale || [];
  const published = view?.status === 'PUBLISHED';
  const pendingCount = (stats.candidates || 0) - (stats.fullyEvaluated || 0);

  // why results are pending: each reason with the subjects it applies to, so it is clear what to do
  const pendingReasons = (() => {
    const map = new Map(); // reason -> Map(subject label -> cells)
    rows.forEach((r) =>
      r.grades.forEach((g, i) => {
        if (g?.state !== 'PENDING') return;
        const reason = g.reason || 'Mark pending';
        const label = subjects[i]?.label || subjects[i]?.code || '';
        if (!map.has(reason)) map.set(reason, new Map());
        map.get(reason).set(label, (map.get(reason).get(label) || 0) + 1);
      })
    );
    return [...map.entries()].map(([reason, bySubject]) => ({
      reason,
      detail: [...bySubject.entries()].map(([label, n]) => `${label} (${n})`).join(', '),
    }));
  })();
  const colSpan = subjects.length + 6;

  return (
    <div className="rp-page">
      <div className="rp-head">
        <div>
          <h1>Result processing</h1>
          <p>
            Grades use the INC scale; SGPA = Σ(credit × grade point) ÷ Σ credits, counting only
            subjects marked “Added to SGPA”.
          </p>
        </div>
        <div className="rp-actions">
          <button
            type="button"
            className="rp-btn outline"
            onClick={() => printSheet(view, filters)}
            disabled={!rows.length}
          >
            Print result sheet
          </button>
          {published ? (
            <button type="button" className="rp-btn danger-outline" onClick={onWithdraw} disabled={busy}>
              Withdraw results
            </button>
          ) : (
            <button
              type="button"
              className="rp-btn primary"
              onClick={onPublish}
              disabled={busy || loading || !rows.length || pendingCount > 0}
              title={pendingCount > 0 ? 'Enter the missing marks first' : undefined}
            >
              Publish results
            </button>
          )}
        </div>
      </div>

      {msg && <p className={`rp-alert ${msg.ok ? 'ok' : 'error'}`}>{msg.text}</p>}

      {/* ---- summary ---- */}
      <div className="rp-stats">
        <div className="rp-stat">
          <span className="rp-stat-label">Candidates</span>
          <span className="rp-stat-value">{stats.candidates ?? 0}</span>
          <span className={`rp-stat-note ${pendingCount > 0 ? 'warn' : ''}`}>
            {pendingCount > 0
              ? `${stats.fullyEvaluated ?? 0} fully evaluated, ${pendingCount} pending`
              : `${stats.fullyEvaluated ?? 0} fully evaluated`}
          </span>
        </div>
        <div className="rp-stat">
          <span className="rp-stat-label">Passed all subjects</span>
          <span className="rp-stat-value">{stats.passed ?? 0}</span>
          <span className="rp-stat-note">{stats.passRate ?? 0}% pass rate</span>
        </div>
        <div className="rp-stat">
          <span className="rp-stat-label">Reappear (RA)</span>
          <span className="rp-stat-value">{stats.reappear ?? 0}</span>
          <span className="rp-stat-note">at least one subject</span>
        </div>
        <div className="rp-stat">
          <span className="rp-stat-label">Highest SGPA</span>
          <span className="rp-stat-value">{fmtSgpa(stats.highestSgpa)}</span>
          <span className="rp-stat-note">{stats.highestName || '—'}</span>
        </div>
      </div>

      {/* ---- filters + table ---- */}
      <section className="rp-card">
        <div className="rp-filters">
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
                <option key={c.courseCode} value={c.courseCode}>
                  {c.courseCode}
                </option>
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
        </div>

        <div className="rp-info">
          <span>Inst name <b>{info.instName}</b></span>
          <span>Degree <b>{info.degree}</b></span>
          <span>Course mode <b>{info.courseMode}</b></span>
          <span>Department <b>{info.department}</b></span>
          <span>Regulation <b>{info.regulation}</b></span>
          <span>Exam pattern <b>{info.examPattern} {shortSemester(filters.semester)}</b></span>
          <span>
            Status <b className={published ? 'ok' : ''}>{view ? view.status : '—'}</b>
            {published && view.publishedOn ? ` on ${fmtDate(view.publishedOn)}` : ''}
          </span>
        </div>

        <div className="rp-table-wrap">
          <table className="rp-table">
            <thead>
              <tr>
                <th>Register no</th>
                <th>Name</th>
                {subjects.map((s) => (
                  <th key={s.key || s.code} className="c" title={[s.name, s.name2].filter(Boolean).join(' & ')}>
                    {s.label || s.code}
                  </th>
                ))}
                <th className="c">Credits</th>
                <th className="c">SGPA</th>
                <th>Result</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={colSpan} className="rp-empty">Loading…</td></tr>
              )}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={colSpan} className="rp-empty">
                    No candidates found. Results appear once attendance and marks are entered for this selection.
                  </td>
                </tr>
              )}
              {!loading &&
                rows.map((r) => (
                  <tr key={r.regNo}>
                    <td><b>{r.regNo}</b></td>
                    <td>{r.name}</td>
                    {r.grades.map((g, i) => {
                      const cell = cellOf(g);
                      return (
                        <td key={subjects[i]?.key || i} className="c">
                          <span className={`rp-grade ${cell.tone}`} title={cell.tip}>{cell.text}</span>
                        </td>
                      );
                    })}
                    <td className="c">{r.creditsEarned}/{r.creditsTotal}</td>
                    <td className="c"><b>{fmtSgpa(r.sgpa)}</b></td>
                    <td>
                      <span className={`rp-pill ${r.result === 'Pass' ? 'pass' : r.result === 'RA' ? 'ra' : 'pending'}`}>
                        {r.result}
                      </span>
                    </td>
                    <td className="r">
                      <button
                        type="button"
                        className="rp-btn outline small"
                        onClick={() => printStatement(view, filters, r)}
                        disabled={!published}
                        title={published ? undefined : 'Publish the results to issue statements'}
                      >
                        Statement
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        {!published && rows.length > 0 && (
          <div className="rp-foot">
            {pendingCount > 0 ? (
              <span className="rp-warn">
                {pendingCount} candidate{pendingCount > 1 ? 's are' : ' is'} not fully evaluated (cells marked “…”).
                Enter the missing marks to publish.
                {pendingReasons.map((p) => (
                  <span key={p.reason} style={{ display: 'block', marginTop: 4, fontWeight: 400 }}>
                    <b>{p.reason}:</b> {p.detail}
                  </span>
                ))}
              </span>
            ) : (
              <span>Draft preview. Publish to freeze the grades and issue statements.</span>
            )}
          </div>
        )}
      </section>

      {/* ---- grading scale (from Settings) ---- */}
      <section className="rp-card">
        <h3 className="rp-card-title">INC grading scale</h3>
        <div className="rp-scale">
          {scale.length === 0 && <span className="rp-muted">Grading scale is not set in Settings.</span>}
          {scale.map((g) => (
            <div className="rp-scale-item" key={g.grade}>
              <span className="rp-scale-desc">{g.description}</span>
              <span className="rp-scale-grade">
                <b>{g.grade}</b> GP {g.gradePoint}
              </span>
              <span className="rp-scale-min">{g.minPercent}% and above</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
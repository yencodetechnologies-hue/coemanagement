import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  fetchTTOptions,
  fetchTTSubjects,
  fetchSavedTT,
  saveTT,
  deleteTT,
} from '../config/theoryTimeTable';
import { UNIVERSITY, SESSION_TIMINGS } from '../config/institution';
import './TheoryTimeTable.css';

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
const SESSION_ORDER = { FN: 0, AN: 1 };

const shortSemester = (s) => String(s || '').replace(/^semester\s*/i, '');

// One row = one subject code + component, so the Theory and the Practical paper of the same
// code are separate rows with their own date (same key as the backend uses).
const rowKey = (r) => `${r.subCode}::${String(r.component || '').trim().toLowerCase()}`;
const isPractical = (r) => /practical|clinical/i.test(r.component || '');
const paperLabel = (r) => `${r.subCode}${r.component ? ` (${r.component})` : ''}`;

// yyyy-mm-dd -> dd-mm-yyyy
const formatDate = (d) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d || '');
  return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
};

const dayName = (d) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d || '');
  if (!m) return '';
  return new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString('en-IN', { weekday: 'long' });
};

const defaultExamYear = () => {
  const now = new Date();
  return `${now.getMonth() >= 5 ? 'SEP' : 'MAR'}-${now.getFullYear()}`;
};

const buildExamYears = (extra) => {
  const y = new Date().getFullYear();
  const list = [];
  for (let yr = y - 1; yr <= y + 1; yr++) {
    list.push(`MAR-${yr}`, `SEP-${yr}`);
  }
  if (extra && !list.includes(extra)) list.push(extra);
  return list;
};

export default function TheoryTimeTable() {
  const [options, setOptions] = useState({ institutions: [], courses: [], terms: 0 });
  const [filters, setFilters] = useState({
    instCode: '',
    course: '',
    semester: '',
    examYear: defaultExamYear(),
  });
  const [info, setInfo] = useState(null);
  const [rows, setRows] = useState([]);
  const [saved, setSaved] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  const notify = (type, text) => {
    setMsg({ type, text });
    setTimeout(() => setMsg(null), 4000);
  };

  const semesters = useMemo(
    () => Array.from({ length: options.terms || 0 }, (_, i) => `Semester ${ROMAN[i]}`),
    [options.terms]
  );
  const examYears = useMemo(() => buildExamYears(filters.examYear), [filters.examYear]);

  // ---- institutions / courses / terms (cascading dropdowns) ----
  useEffect(() => {
    fetchTTOptions({ instCode: filters.instCode, course: filters.course })
      .then((o) => {
        setOptions(o);
        setFilters((f) => ({
          ...f,
          instCode: f.instCode || o.institutions[0]?.instCode || '',
          course: o.courses.some((c) => c.courseCode === f.course)
            ? f.course
            : o.courses[0]?.courseCode || '',
        }));
      })
      .catch((e) => notify('error', e.message));
  }, [filters.instCode, filters.course]);

  // keep the semester valid for the selected course
  useEffect(() => {
    if (!semesters.length) return;
    setFilters((f) =>
      semesters.includes(f.semester) ? f : { ...f, semester: semesters[0] }
    );
  }, [semesters]);

  // ---- saved time tables list ----
  const loadSaved = () => {
    if (!filters.instCode) return;
    fetchSavedTT(filters.instCode)
      .then(setSaved)
      .catch((e) => notify('error', e.message));
  };
  useEffect(loadSaved, [filters.instCode]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- subjects for the selected course / semester / exam year ----
  const loadSubjects = () => {
    const { instCode, course, semester, examYear } = filters;
    const courseValid = options.courses.some((c) => c.courseCode === course);
    if (!instCode || !course || !semester || !examYear || !courseValid) return;

    setLoading(true);
    fetchTTSubjects(filters)
      .then((data) => {
        setInfo(data.info);
        setRows(data.rows);
      })
      .catch((e) => {
        setInfo(null);
        setRows([]);
        notify('error', e.message);
      })
      .finally(() => setLoading(false));
  };
  useEffect(loadSubjects, [filters, options.courses]); // eslint-disable-line react-hooks/exhaustive-deps

  // change ONE row (subject code + component), not every row with that subject code
  const updateRow = (key, patch) =>
    setRows((rs) => rs.map((r) => (rowKey(r) === key ? { ...r, ...patch } : r)));

  // papers sharing the same date + session
  const clashes = useMemo(() => {
    const seen = {};
    const out = new Set();
    rows.forEach((r) => {
      if (!r.examDate || !r.session) return;
      const slot = `${r.examDate}|${r.session}`;
      (seen[slot] = seen[slot] || []).push(rowKey(r));
    });
    Object.values(seen).forEach((keys) => {
      if (keys.length > 1) keys.forEach((k) => out.add(k));
    });
    return out;
  }, [rows]);

  // subject codes that have more than one row (theory + practical)
  const paired = useMemo(() => {
    const count = {};
    rows.forEach((r) => {
      count[r.subCode] = (count[r.subCode] || 0) + 1;
    });
    return new Set(Object.keys(count).filter((code) => count[code] > 1));
  }, [rows]);

  const handleSave = async () => {
    const incomplete = rows.find((r) => Boolean(r.examDate) !== Boolean(r.session));
    if (incomplete) {
      return notify('error', `Select both date and session for ${paperLabel(incomplete)}`);
    }
    const entries = rows
      .filter((r) => r.examDate && r.session)
      .map(({ subCode, subName, component, conductedBy, examDate, session }) => ({
        subCode,
        subName,
        component: component || '', // tells the Theory and the Practical paper apart
        conductedBy,
        examDate,
        session,
      }));

    setSaving(true);
    try {
      await saveTT({ ...filters, entries });
      notify('success', 'Time table saved');
      loadSaved();
      loadSubjects(); // show what was actually stored
    } catch (e) {
      notify('error', e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (e, row) => {
    e.stopPropagation();
    if (!window.confirm(`Delete ${row.course} – ${row.semester} (${row.examYear}) time table?`)) return;
    try {
      await deleteTT(row._id);
      notify('success', 'Time table deleted');
      loadSaved();
      loadSubjects();
    } catch (err) {
      notify('error', err.message);
    }
  };

  const loadFromSaved = (row) =>
    setFilters({
      instCode: row.instCode,
      course: row.course,
      semester: row.semester,
      examYear: row.examYear,
    });

  // rows that go on paper: scheduled ones, ordered by date then FN before AN
  const printRows = useMemo(
    () =>
      rows
        .filter((r) => r.examDate && r.session)
        .sort(
          (a, b) =>
            a.examDate.localeCompare(b.examDate) ||
            SESSION_ORDER[a.session] - SESSION_ORDER[b.session]
        ),
    [rows]
  );
  const printHasPractical = printRows.some(isPractical);

  const handlePrint = () => {
    if (!printRows.length) {
      return notify('error', 'Schedule at least one paper (date and session) before printing');
    }
    if (clashes.size) {
      return notify('error', 'Some papers share the same date and session. Fix them before printing');
    }
    window.print();
  };

  const instName = info?.instName || filters.instCode;

  // "(Theory)" / "(Practical)" after the name when it is needed to tell two rows apart
  const printName = (r) => {
    const tagged = /\((theory|practical|clinical)\)/i.test(r.subName || '');
    const needsTag = !tagged && r.component && (paired.has(r.subCode) || isPractical(r));
    return `${r.subName}${needsTag ? ` (${r.component})` : ''}`;
  };

  // ---------- printable sheet (portal into <body>, hidden on screen) ----------
  const printSheet = (
    <div className="print-root tt-sheet">
      <div className="tt-header">
        <div className="tt-logo">{UNIVERSITY.logoText}</div>
        <div className="tt-head-text">
          <h1>{UNIVERSITY.fullName}</h1>
          <p>{UNIVERSITY.line1}</p>
          <p>{UNIVERSITY.line2}</p>
          <h3>{instName}</h3>
        </div>
      </div>
      <h2 className="tt-title">
        {printHasPractical ? 'THEORY AND PRACTICAL' : 'THEORY'} EXAMINATION TIME TABLE - {filters.examYear}
      </h2>
      <hr className="tt-rule" />

      <div className="tt-meta">
        <div className="tt-meta-col">
          <div><span>Course</span><b>{info?.courseName || filters.course}</b></div>
          <div><span>Regulation</span><b>{info?.regulation}</b></div>
        </div>
        <div className="tt-meta-col">
          <div><span>Semester</span><b>{shortSemester(filters.semester)}</b></div>
          <div>
            <span>Session</span>
            <b>FN {SESSION_TIMINGS.FN}, AN {SESSION_TIMINGS.AN}</b>
          </div>
        </div>
      </div>

      <table className="tt-table">
        <thead>
          <tr>
            <th style={{ width: '14%' }}>Date</th>
            <th style={{ width: '14%' }}>Day</th>
            <th style={{ width: '12%' }}>Session</th>
            <th style={{ width: '22%' }}>Subject code</th>
            <th>Subject name</th>
          </tr>
        </thead>
        <tbody>
          {printRows.map((r) => (
            <tr key={rowKey(r)}>
              <td className="c">{formatDate(r.examDate)}</td>
              <td className="c">{dayName(r.examDate)}</td>
              <td className="c">{r.session}</td>
              <td className="c">{r.subCode}</td>
              <td>{printName(r)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="tt-footer">
        <div className="tt-sign" />
        <div className="tt-sign right"><span>Controller of Examinations</span></div>
      </div>
    </div>
  );

  // ---------- on-screen page ----------
  return (
    <div className="ttp-page">
      <div className="ttp-head">
        <div>
          <h2>Theory time table</h2>
          <p>
            Schedule each paper, theory and practical, with a date and session (FN forenoon, AN
            afternoon). Dates print on the hall ticket.
          </p>
        </div>
        <button className="ttp-btn" onClick={handlePrint}>Print time table</button>
      </div>

      {msg && <div className={`ttp-msg ${msg.type}`}>{msg.text}</div>}

      <div className="ttp-grid">
        {/* ---- saved time tables ---- */}
        <div className="ttp-card">
          <h3 className="ttp-card-title">Saved time tables</h3>
          <div className="ttp-scroll">
            <table className="ttp-table ttp-saved">
              <thead>
                <tr>
                  <th>Course</th>
                  <th>Exam pattern</th>
                  <th>Term</th>
                  <th>Regulation</th>
                  <th>Exam year</th>
                  <th>Papers</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {saved.length === 0 ? (
                  <tr><td colSpan={7} className="ttp-empty">No saved time tables</td></tr>
                ) : (
                  saved.map((s) => (
                    <tr key={s._id} className="clickable" onClick={() => loadFromSaved(s)}>
                      <td>{s.course}</td>
                      <td>{s.examPattern}</td>
                      <td>{s.term}</td>
                      <td>{s.regulation}</td>
                      <td>{s.examYear}</td>
                      <td>{s.papers}</td>
                      <td>
                        <button className="ttp-link danger" onClick={(e) => handleDelete(e, s)}>
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* ---- editor ---- */}
        <div className="ttp-card">
          <div className="ttp-filters">
            <label>
              <span>Inst code</span>
              <select
                value={filters.instCode}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, instCode: e.target.value, course: '' }))
                }
              >
                {options.institutions.map((i) => (
                  <option key={i.instCode} value={i.instCode}>{i.instCode}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Course code</span>
              <select
                value={filters.course}
                onChange={(e) => setFilters((f) => ({ ...f, course: e.target.value }))}
              >
                {options.courses.map((c) => (
                  <option key={c.courseCode} value={c.courseCode}>{c.courseCode}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Semester</span>
              <select
                value={filters.semester}
                onChange={(e) => setFilters((f) => ({ ...f, semester: e.target.value }))}
              >
                {semesters.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Year of exam</span>
              <select
                value={filters.examYear}
                onChange={(e) => setFilters((f) => ({ ...f, examYear: e.target.value }))}
              >
                {examYears.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </label>
          </div>

          {info && (
            <div className="ttp-info">
              <span>Inst name <b>{instName}</b></span>
              <span>Degree <b>{info.degree}</b></span>
              <span>Course mode <b>{info.courseMode}</b></span>
              <span>Department <b>{info.department}</b></span>
              <span>Regulation <b>{info.regulation}</b></span>
              <span>Exam pattern <b>{info.examPattern} {shortSemester(filters.semester)}</b></span>
            </div>
          )}

          <div className="ttp-scroll">
            <table className="ttp-table">
              <thead>
                <tr>
                  <th>Subject code</th>
                  <th>Subject name</th>
                  <th>Type</th>
                  <th>Exam date</th>
                  <th>Session FN/AN</th>
                  <th>Conducted by</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={6} className="ttp-empty">Loading…</td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={6} className="ttp-empty">No subjects found</td></tr>
                ) : (
                  rows.map((r) => {
                    const key = rowKey(r);
                    return (
                      <tr key={key} className={clashes.has(key) ? 'clash' : ''}>
                        <td><b>{r.subCode}</b></td>
                        <td>{r.subName}</td>
                        <td>{r.component || '—'}</td>
                        <td>
                          <input
                            type="date"
                            value={r.examDate}
                            onChange={(e) => updateRow(key, { examDate: e.target.value })}
                            aria-label={`Exam date for ${paperLabel(r)}`}
                          />
                        </td>
                        <td>
                          <select
                            value={r.session}
                            onChange={(e) => updateRow(key, { session: e.target.value })}
                            aria-label={`Session for ${paperLabel(r)}`}
                          >
                            <option value=""></option>
                            <option value="FN">FN</option>
                            <option value="AN">AN</option>
                          </select>
                        </td>
                        <td>{r.conductedBy}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="ttp-toolbar">
            {clashes.size > 0 && (
              <span className="ttp-warn">
                Highlighted papers share the same date and session.
              </span>
            )}
            <button
              className="ttp-btn primary"
              onClick={handleSave}
              disabled={saving || loading || rows.length === 0}
            >
              {saving ? 'Saving…' : 'Save time table'}
            </button>
          </div>
        </div>
      </div>

      {createPortal(printSheet, document.body)}
    </div>
  );
}
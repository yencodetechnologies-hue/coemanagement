import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import API_BASE_URL from '../config/api';
import {
  fetchAHOptions,
  fetchApplication,
  saveAppSettings,
  issueHallTickets,
} from '../config/applicationHallTicket';
import { UNIVERSITY, SESSION_TIMINGS } from '../config/institution';
import './ApplicationHallTicket.css';

const FILTERS = [
  { key: 'instCode', label: 'Inst code' },
  { key: 'course', label: 'Course code' },
  { key: 'batch', label: 'Batch' },
  { key: 'semester', label: 'Semester' },
  { key: 'examYear', label: 'Year of exam' },
  { key: 'studentCategory', label: 'Student category' },
];

const DEFAULT_SETTINGS = {
  addOnTitle: '',
  lastDate: '',
  penaltyDate: '',
  applicationCost: 0,
  markSheetCost: 0,
  provisional1Cost: 0,
  provisional2Cost: 0,
  convocationCost: 0,
  penalty: 0,
  applyPenalty: false,
};

const n = (v) => Number(v) || 0;
const inr = (v) => Number(v || 0).toLocaleString('en-IN');
const shortSemester = (s) => String(s || '').replace(/^semester\s*/i, '');
const shortGender = (g) => (g ? g.charAt(0).toUpperCase() : '—');

/* ---------- arrear handling (hall ticket only) ---------- */

// Exact-match fail codes. The old /fail|f/i matched ANY text containing the letter "f".
const FAIL_RE = /^(f|fail|failed|ra|re-?appear|ab|absent)$/i;

// Accept either naming style from the API so arrear rows are never dropped
const normalizePaper = (p) => ({
  ...p,
  subCode: p.subCode || p.subjectCode || p.code || '',
  subName: p.subName || p.subjectName || p.name || '',
});

// A paper is an arrear paper when:
//  1. it came from the candidate's arrear list (_arrear), or
//  2. the API flags it (isArrear / type / category / paperType), or
//  3. its previous result is a fail code, or
//  4. the selected student category itself is "Arrear" (then every paper is an arrear paper)
const checkIsArrearPaper = (p, studentCategory = '') => {
  if (p._arrear || p.isArrear) return true;
  if (/arrear/i.test(`${p.type || ''} ${p.category || ''} ${p.paperType || ''}`)) return true;
  if (FAIL_RE.test(String(p.result || p.internalStatus || p.internalResult || '').trim())) return true;
  return /arrear/i.test(studentCategory);
};

const isPracticalPaper = (p) => /practical|clinical/i.test(p.component || '');

// Everything that must be printed on the hall ticket:
// current-semester papers + arrear papers + the practical paper of a subject code that has
// both theory and practical. One row per subject code AND component, so the Theory and the
// Practical of the same code are both kept.
const getHallTicketPapers = (c, studentCategory = '') => {
  const regular = (c.papers || []).map(normalizePaper);
  const arrears = (c.arrearPapers || c.arrears || []).map((p) => ({
    ...normalizePaper(p),
    _arrear: true,
  }));
  const practicals = (c.practicalPapers || []).map((p) => ({
    ...normalizePaper(p),
    _arrear: Boolean(p.isArrear),
  }));

  const keyOf = (p) => `${p.subCode}|${isPracticalPaper(p) ? 'P' : 'T'}`;
  const byKey = new Map();
  [...regular, ...arrears, ...practicals].forEach((p) => {
    const prev = byKey.get(keyOf(p));
    if (!prev) {
      byKey.set(keyOf(p), p);
      return;
    }
    // same paper in two lists: keep one row, keep whichever side has the schedule
    byKey.set(keyOf(p), {
      ...prev,
      ...p,
      examDate: p.examDate || prev.examDate,
      session: p.session || prev.session,
      semester: p.semester || prev.semester,
      _arrear: Boolean(prev._arrear || p._arrear),
    });
  });

  const list = [...byKey.values()].map((p) => ({
    ...p,
    _practical: isPracticalPaper(p),
    _arrear: checkIsArrearPaper(p, studentCategory),
  }));

  // a subject code that has both a theory and a practical row
  const perCode = {};
  list.forEach((p) => {
    perCode[p.subCode] = (perCode[p.subCode] || 0) + 1;
  });
  return list.map((p) => ({ ...p, _paired: perCode[p.subCode] > 1 }));
};

// Subject name with (Theory) / (Practical) and (Arrear) tags — used ONLY on the hall ticket
const renderSubName = (p) => {
  const named = /\((theory|practical)\)/i.test(p.subName || '');
  const tag = named ? '' : p._practical ? ' (Practical)' : p._paired ? ' (Theory)' : '';
  return (
    <>
      {p.subName}
      {tag}
      {p._arrear && <strong> (Arrear)</strong>}
    </>
  );
};

// yyyy-mm-dd or dd-mm-yyyy -> dd-mm-yyyy
const formatDate = (d) => {
  if (!d) return '—';
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  if (iso) return `${iso[3]}-${iso[2]}-${iso[1]}`;
  return String(d).replace(/\//g, '-');
};

const dayName = (d) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d || '');
  if (!m) return '';
  return new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString('en-IN', { weekday: 'long' });
};

const photoSrc = (u) => {
  if (!u) return '';
  if (/^(https?:|data:)/.test(u)) return u;
  return `${API_BASE_URL}${u.startsWith('/') ? '' : '/'}${u}`;
};

/* ---------- small print helpers ---------- */
function Letterhead({ instName }) {
  return (
    <div className="ah-header">
      <div className="ah-logo">{UNIVERSITY.logoText}</div>
      <div className="ah-head-text">
        <h1>{UNIVERSITY.fullName}</h1>
        <p>{UNIVERSITY.line1}</p>
        <p>{UNIVERSITY.line2}</p>
        <h3>{instName}</h3>
      </div>
    </div>
  );
}

function PageTitle({ title, sub }) {
  return (
    <>
      <h2 className="ah-title">{title}</h2>
      {sub ? <p className="ah-sub">{sub}</p> : null}
      <hr className="ah-rule" />
    </>
  );
}

function Meta({ pairs }) {
  return (
    <div className="ah-meta">
      {pairs.map(([label, value]) => (
        <div key={label}>
          <span>{label}</span>
          <b>{value || '—'}</b>
        </div>
      ))}
    </div>
  );
}

export default function ApplicationHallTicket() {
  const [options, setOptions] = useState({});
  const [filters, setFilters] = useState({});
  const [info, setInfo] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [regFrom, setRegFrom] = useState('');
  const [regTo, setRegTo] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const [printMode, setPrintMode] = useState(null); // 'nominal' | 'application' | 'hallticket'
  const [msg, setMsg] = useState(null);

  const notify = (type, text) => {
    setMsg({ type, text });
    setTimeout(() => setMsg(null), 4500);
  };

  const setS = (key, value) => setSettings((s) => ({ ...s, [key]: value }));

  // ---- dropdown values ----
  useEffect(() => {
    fetchAHOptions()
      .then((opts) => {
        setOptions(opts);
        setFilters(
          Object.fromEntries(FILTERS.map(({ key }) => [key, opts[key]?.[0] || '']))
        );
      })
      .catch((e) => notify('error', e.message));
  }, []);

  // ---- candidates, papers and saved settings ----
  useEffect(() => {
    if (!FILTERS.every(({ key }) => filters[key])) return;
    setLoading(true);
    fetchApplication(filters)
      .then((data) => {
        setInfo(data.info);
        setCandidates(data.candidates);
        setSettings({ ...DEFAULT_SETTINGS, ...data.settings });
        setRegFrom(data.candidates[0]?.regNo || '');
        setRegTo(data.candidates[data.candidates.length - 1]?.regNo || '');
      })
      .catch((e) => {
        setInfo(null);
        setCandidates([]);
        notify('error', e.message);
      })
      .finally(() => setLoading(false));
  }, [filters]);

  // ---- reg no range + total fee ----
  const extras =
    n(settings.applicationCost) +
    n(settings.markSheetCost) +
    n(settings.provisional1Cost) +
    n(settings.provisional2Cost) +
    n(settings.convocationCost) +
    (settings.applyPenalty ? n(settings.penalty) : 0);

  const rangeRows = useMemo(() => {
    const a = candidates.findIndex((c) => c.regNo === regFrom);
    const b = candidates.findIndex((c) => c.regNo === regTo);
    if (a < 0 || b < 0) return [];
    const [lo, hi] = a <= b ? [a, b] : [b, a];
    return candidates.slice(lo, hi + 1).map((c) => {
      // regular + arrear papers, bound together for the hall ticket
      const htPapers = getHallTicketPapers(c, filters.studentCategory);
      return {
        ...c,
        totalFee: c.papersCount ? c.examFee + extras : 0,
        htPapers,
        arrearCount: htPapers.filter((p) => p._arrear).length,
      };
    });
  }, [candidates, regFrom, regTo, extras, filters.studentCategory]);

  // Application form: unchanged — current papers only
  const applicants = rangeRows.filter((c) => c.papersCount > 0);

  // Hall ticket: anyone with at least one paper to write, including arrear-only candidates
  const hallTicketCandidates = rangeRows.filter((c) => c.htPapers.length > 0);
  const ticketed = hallTicketCandidates.filter((c) => c.hallTicketNo);

  // ---- actions ----
  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      await saveAppSettings({ ...filters, settings });
      notify('success', 'Details saved');
    } catch (e) {
      notify('error', e.message);
    } finally {
      setSaving(false);
    }
  };

  const printNow = (mode) => {
    setPrintMode(mode);
    setTimeout(() => window.print(), 300); // let the print sheet render first
  };

  const handleNominal = () => {
    if (!rangeRows.length) return notify('error', 'No candidates in range');
    printNow('nominal');
  };

  const handleApplication = () => {
    if (!applicants.length) return notify('error', 'No eligible candidates in range');
    printNow('application');
  };

  const handleHallTicket = async () => {
    if (!hallTicketCandidates.length) {
      return notify('error', 'No eligible candidates in range');
    }
    // the papers come from the internal marks: warn when those are not verified and locked yet
    if (
      info?.marksVerified === false &&
      !window.confirm(
        `The internal marks of batch ${filters.batch} (${filters.examYear}) are not verified and locked yet.\n` +
        'If a mark changes later, the papers on the hall ticket can change.\n\nPrint the hall tickets anyway?'
      )
    ) return;
    setIssuing(true);
    try {
      const res = await issueHallTickets({
        ...filters,
        regNos: hallTicketCandidates.map((c) => c.regNo),
      });
      const issued = res?.issued || {};
      setCandidates((cs) =>
        cs.map((c) => (issued[c.regNo] ? { ...c, hallTicketNo: issued[c.regNo] } : c))
      );

      const undated = hallTicketCandidates.some((c) =>
        c.htPapers.some((p) => !p.examDate)
      );
      if (info && !info.hasTimetable) {
        notify('error', 'No saved theory time table for this semester. Exam dates will print blank.');
      } else if (undated) {
        notify('error', 'Some papers have no exam date in the time table. They will print blank.');
      }
      printNow('hallticket');
    } catch (e) {
      notify('error', e.message);
    } finally {
      setIssuing(false);
    }
  };

  const instName = info?.instName || filters.instCode || '';
  const headLabel = info?.headDesignation || 'Dean / Principal';
  const monthYear = filters.examYear;
  const addOn = settings.addOnTitle?.trim();

  const candidatePairs = (c) => [
    ['Register no', c.regNo],
    ['Name', c.name],
    ['Date of birth', formatDate(c.dob)],
    ['Gender', c.gender],
    ['Course', info?.courseName || filters.course],
    ['Batch', filters.batch],
    ['Semester', shortSemester(filters.semester)],
    ['Regulation', info?.regulation],
    ['Category', filters.studentCategory],
  ];

  /* ---------------- printable sheets (portal into <body>) ---------------- */
  const printSheet = (
    <div className="print-root ah-sheet">
      {/* ---- Nominal details ---- */}
      {printMode === 'nominal' && (
        <div className="ah-page">
          <Letterhead instName={instName} />
          <PageTitle title="NOMINAL DETAILS" sub={addOn} />
          <Meta
            pairs={[
              ['Course', info?.courseName || filters.course],
              ['Month & year', monthYear],
              ['Batch', filters.batch],
              ['Semester', shortSemester(filters.semester)],
              ['Regulation', info?.regulation],
              ['Student category', filters.studentCategory],
            ]}
          />
          <table className="ah-table">
            <thead>
              <tr>
                <th style={{ width: '7%' }}>S.No</th>
                <th style={{ width: '17%' }}>Register no</th>
                <th>Name of the candidate</th>
                <th style={{ width: '9%' }}>Gender</th>
                <th style={{ width: '14%' }}>DOB</th>
                <th style={{ width: '9%' }}>Papers</th>
                <th style={{ width: '14%' }}>Total fee (₹)</th>
              </tr>
            </thead>
            <tbody>
              {rangeRows.map((c, i) => (
                <tr key={c.regNo}>
                  <td className="c">{i + 1}</td>
                  <td>{c.regNo}</td>
                  <td>{c.name}</td>
                  <td className="c">{shortGender(c.gender)}</td>
                  <td className="c">{formatDate(c.dob)}</td>
                  <td className="c">{c.papersCount}</td>
                  <td className="r">{inr(c.totalFee)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="ah-footer">
            <div className="ah-sign"><span>{headLabel}</span></div>
            <div className="ah-sign right"><span>Controller of Examinations</span></div>
          </div>
        </div>
      )}

      {/* ---- Application form: one page per candidate ---- */}
      {printMode === 'application' &&
        applicants.map((c) => {
          const feeRows = [
            [`Examination fee (${c.papersCount} paper${c.papersCount > 1 ? 's' : ''})`, c.examFee],
            ['Application cost', n(settings.applicationCost)],
            ['Mark sheet cost', n(settings.markSheetCost)],
            ['Provisional-1 cost', n(settings.provisional1Cost)],
            ['Provisional-2 cost', n(settings.provisional2Cost)],
            ['Convocation cost', n(settings.convocationCost)],
            ['Penalty (late submission)', settings.applyPenalty ? n(settings.penalty) : 0],
          ].filter(([, amt], idx) => idx === 0 || amt > 0);

          return (
            <div className="ah-page" key={c.regNo}>
              <Letterhead instName={instName} />
              <PageTitle title={`APPLICATION FOR EXAMINATION - ${monthYear}`} sub={addOn} />
              <Meta pairs={candidatePairs(c)} />

              <table className="ah-table">
                <thead>
                  <tr>
                    <th style={{ width: '8%' }}>S.No</th>
                    <th style={{ width: '22%' }}>Subject code</th>
                    <th>Subject name</th>
                    <th style={{ width: '16%' }}>Fee (₹)</th>
                  </tr>
                </thead>
                <tbody>
                  {c.papers.map((p, i) => (
                    <tr key={p.subCode}>
                      <td className="c">{i + 1}</td>
                      <td className="c">{p.subCode}</td>
                      {/* Strictly SubName here, no arrear tag for Application */}
                      <td>{p.subName}</td>
                      <td className="r">{inr(p.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <table className="ah-table ah-fee">
                <tbody>
                  {feeRows.map(([label, amt]) => (
                    <tr key={label}>
                      <td>{label}</td>
                      <td className="r">{inr(amt)}</td>
                    </tr>
                  ))}
                  <tr className="total">
                    <td>Total fee payable</td>
                    <td className="r">₹ {inr(c.totalFee)}</td>
                  </tr>
                </tbody>
              </table>

              <p className="ah-note">
                Last date for submission: <b>{formatDate(settings.lastDate)}</b>. With penalty
                up to: <b>{formatDate(settings.penaltyDate)}</b>.
              </p>

              <div className="ah-footer">
                <div className="ah-sign"><span>Signature of the candidate</span></div>
                <div className="ah-sign right"><span>{headLabel}</span></div>
              </div>
            </div>
          );
        })}

      {/* ---- Hall ticket: one page per candidate (regular + arrear papers) ---- */}
      {printMode === 'hallticket' &&
        ticketed.map((c) => {
          const total = c.htPapers.length;
          const arrearCount = c.arrearCount;
          const regularCount = total - arrearCount;

          const titleTag =
            arrearCount === 0 ? '' : regularCount === 0 ? ' (ARREAR)' : ' (REGULAR & ARREAR)';

          // Show a semester column only when the API sends a semester per paper
          const showSem = c.htPapers.some((p) => p.semester);

          // Date ascending, FN before AN; undated papers (practicals) last, by subject code
          const scheduled = [...c.htPapers].sort(
            (a, b) =>
              (a.examDate || '9999').localeCompare(b.examDate || '9999') ||
              (a.session || '').localeCompare(b.session || '') * -1 ||
              a.subCode.localeCompare(b.subCode) ||
              Number(a._practical) - Number(b._practical)
          );

          return (
            <div className="ah-page" key={c.regNo}>
              <Letterhead instName={instName} />
              <PageTitle title={`HALL TICKET${titleTag} - ${monthYear}`} sub={addOn} />

              <div className="ah-ht-top">
                <Meta pairs={[['Hall ticket no', c.hallTicketNo], ...candidatePairs(c)]} />
                <div className="ah-photo">
                  {c.photoUrl ? <img src={photoSrc(c.photoUrl)} alt="" /> : <span>Photo</span>}
                </div>
              </div>

              <table className="ah-table">
                <thead>
                  <tr>
                    <th style={{ width: '7%' }}>S.No</th>
                    <th style={{ width: '13%' }}>Date</th>
                    <th style={{ width: '13%' }}>Day</th>
                    <th style={{ width: '9%' }}>Session</th>
                    {showSem && <th style={{ width: '7%' }}>Sem</th>}
                    <th style={{ width: showSem ? '17%' : '20%' }}>Subject code</th>
                    <th>Subject name</th>
                  </tr>
                </thead>
                <tbody>
                  {scheduled.map((p, i) => (
                    <tr key={`${p.subCode}-${i}`}>
                      <td className="c">{i + 1}</td>
                      <td className="c">{p.examDate ? formatDate(p.examDate) : '—'}</td>
                      <td className="c">{dayName(p.examDate) || '—'}</td>
                      <td className="c">{p.session || '—'}</td>
                      {showSem && (
                        <td className="c">
                          {shortSemester(p.semester) || shortSemester(filters.semester)}
                        </td>
                      )}
                      <td className="c">{p.subCode}</td>
                      {/* Arrear tag specifically applied here on Hall Ticket */}
                      <td>{renderSubName(p)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {arrearCount > 0 && (
                <p className="ah-note">
                  Total papers: <b>{total}</b> (Regular <b>{regularCount}</b>, Arrear{' '}
                  <b>{arrearCount}</b>)
                </p>
              )}

              <p className="ah-note">
                Session timings: FN {SESSION_TIMINGS.FN}, AN {SESSION_TIMINGS.AN}
              </p>

              <div className="ah-footer">
                <div className="ah-sign"><span>Signature of the candidate</span></div>
                <div className="ah-sign right"><span>Controller of Examinations</span></div>
              </div>
            </div>
          );
        })}
    </div>
  );

  /* ---------------- on-screen page ---------------- */
  return (
    <div className="ahp-page">
      <div className="ahp-head">
        <div>
          <h2>Application &amp; hall ticket</h2>
          <p>
            Generate the university examination application form and hall ticket for a
            register-number range. Fees and penalty come from the values below.
          </p>
        </div>
        <div className="ahp-actions">
          <button className="ahp-btn" onClick={handleNominal}>Nominal details</button>
          <button className="ahp-btn" onClick={handleApplication}>Print application</button>
          <button className="ahp-btn primary" onClick={handleHallTicket} disabled={issuing}>
            {issuing ? 'Issuing…' : 'Print hall ticket'}
          </button>
        </div>
      </div>

      {msg && <div className={`ahp-msg ${msg.type}`}>{msg.text}</div>}

      {/* ---- Base details ---- */}
      <div className="ahp-card">
        <h3 className="ahp-card-title">Base details</h3>
        <div className="ahp-filters">
          {FILTERS.map(({ key, label }) => (
            <label key={key}>
              <span>{label}</span>
              <select
                value={filters[key] || ''}
                onChange={(e) => setFilters((f) => ({ ...f, [key]: e.target.value }))}
              >
                {(options[key] || []).map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </label>
          ))}
        </div>

        {info && (
          <div className="ahp-info">
            <span>Inst name <b>{instName}</b></span>
            <span>Degree <b>{info.degree}</b></span>
            <span>Course mode <b>{info.courseMode}</b></span>
            <span>Department <b>{info.department}</b></span>
            <span>Regulation <b>{info.regulation}</b></span>
            <span>Exam pattern <b>{info.examPattern} {shortSemester(filters.semester)}</b></span>
            {info.subjectCategory && <span>Subject category <b>{info.subjectCategory}</b></span>}
            {info.status && <span>Status <b>{info.status}</b></span>}
            {info.marksVerified !== null && info.marksVerified !== undefined && (
              <span>
                Internal marks{' '}
                <b>
                  {info.marksVerified
                    ? `Verified${info.marksVerifiedOn ? ` on ${formatDate(String(info.marksVerifiedOn))}` : ''}`
                    : 'Not verified'}
                </b>
              </span>
            )}
          </div>
        )}

        <div className="ahp-addon">
          <label>
            <span>Add on title</span>
            <input
              type="text"
              value={settings.addOnTitle}
              onChange={(e) => setS('addOnTitle', e.target.value)}
            />
          </label>
        </div>
      </div>

      <div className="ahp-grid">
        {/* ---- Other details ---- */}
        <div className="ahp-card">
          <div className="ahp-card-head">
            <h3 className="ahp-card-title nopad">Other details</h3>
            <span className="ahp-muted">Amounts in ₹</span>
          </div>
          <div className="ahp-form">
            <label>
              <span>Exam application submitted last date</span>
              <input type="date" value={settings.lastDate} onChange={(e) => setS('lastDate', e.target.value)} />
            </label>
            <label>
              <span>Submitted with penalty until</span>
              <input type="date" value={settings.penaltyDate} onChange={(e) => setS('penaltyDate', e.target.value)} />
            </label>
            <label>
              <span>Application cost</span>
              <input type="number" min="0" value={settings.applicationCost} onChange={(e) => setS('applicationCost', e.target.value)} />
            </label>
            <label>
              <span>Mark sheet cost</span>
              <input type="number" min="0" value={settings.markSheetCost} onChange={(e) => setS('markSheetCost', e.target.value)} />
            </label>
            <label>
              <span>Provisional-1 cost</span>
              <input type="number" min="0" value={settings.provisional1Cost} onChange={(e) => setS('provisional1Cost', e.target.value)} />
            </label>
            <label>
              <span>Provisional-2 cost</span>
              <input type="number" min="0" value={settings.provisional2Cost} onChange={(e) => setS('provisional2Cost', e.target.value)} />
            </label>
            <label>
              <span>Convocation cost</span>
              <input type="number" min="0" value={settings.convocationCost} onChange={(e) => setS('convocationCost', e.target.value)} />
            </label>
            <label>
              <span>Penalty</span>
              <input type="number" min="0" value={settings.penalty} onChange={(e) => setS('penalty', e.target.value)} />
            </label>
            <label>
              <span>Reg. no from</span>
              <select value={regFrom} onChange={(e) => setRegFrom(e.target.value)}>
                {candidates.map((c) => (
                  <option key={c.regNo} value={c.regNo}>{c.regNo}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Reg. no to</span>
              <select value={regTo} onChange={(e) => setRegTo(e.target.value)}>
                {candidates.map((c) => (
                  <option key={c.regNo} value={c.regNo}>{c.regNo}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="ahp-form-foot">
            <label className="ahp-check">
              <input
                type="checkbox"
                checked={settings.applyPenalty}
                onChange={(e) => setS('applyPenalty', e.target.checked)}
              />
              <span>Add penalty to the total fee (late submission)</span>
            </label>
            <button className="ahp-btn" onClick={handleSaveSettings} disabled={saving}>
              {saving ? 'Saving…' : 'Save details'}
            </button>
          </div>
        </div>

        {/* ---- Candidates in range ---- */}
        <div className="ahp-card">
          <h3 className="ahp-card-title">{rangeRows.length} candidates in range</h3>
          <div className="ahp-scroll">
            <table className="ahp-table">
              <thead>
                <tr>
                  <th>Register no</th>
                  <th>Name</th>
                  <th className="num">Papers</th>
                  <th className="num">Total fee</th>
                  <th>Hall ticket</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={5} className="ahp-empty">Loading…</td></tr>
                ) : rangeRows.length === 0 ? (
                  <tr><td colSpan={5} className="ahp-empty">No candidates found</td></tr>
                ) : (
                  rangeRows.map((c) => (
                    <tr key={c.regNo}>
                      <td><b>{c.regNo}</b></td>
                      <td>
                        {c.name}
                        {c.papersCount > 0 && (
                          <div className="ahp-papers">
                            {/* No arrear marking on screen — it is printed only on the Hall Ticket */}
                            {c.papers.map((p) => p.subCode).join(', ')}
                          </div>
                        )}
                        {c.remarks && <div className="ahp-remark">{c.remarks}</div>}
                      </td>
                      <td className="num">{c.papersCount}</td>
                      <td className="num">{inr(c.totalFee)}</td>
                      <td>
                        {c.hallTicketNo ? (
                          <span className="pill issued">Issued {c.hallTicketNo}</span>
                        ) : c.htPapers.length === 0 ? (
                          <span className="pill blocked">Not eligible</span>
                        ) : (
                          <span className="pill pending">Not issued</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {createPortal(printSheet, document.body)}
    </div>
  );
}
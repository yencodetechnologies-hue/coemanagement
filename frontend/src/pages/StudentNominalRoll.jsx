import { useEffect, useState } from 'react';
import { fetchNominalFilters, fetchNominalRoll } from '../config/nominalRoll';
import { UNIVERSITY } from '../config/institution';
import './StudentNominalRoll.css';

const FILTERS = [
  { key: 'instCode', label: 'Inst code' },
  { key: 'course', label: 'Course code' },
  { key: 'batch', label: 'Batch' },
  { key: 'semester', label: 'Semester' },
  { key: 'examYear', label: 'Year of exam' },
  { key: 'studentCategory', label: 'Student category' },
];

const formatDob = (d) => {
  if (!d) return '—';
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  if (iso) return `${iso[3]}-${iso[2]}-${iso[1]}`;
  return String(d).replace(/\//g, '-');
};

const shortGender = (g) => (g && g !== '—' ? g.charAt(0).toUpperCase() : '—');
const shortSemester = (s) => String(s || '').replace(/^semester\s*/i, '');

// The percentage is the average of the subjects entered on the Attendance & internal marks page.
// When some subjects are not entered yet, the row says how many it is based on.
const subjectsNote = (s) =>
  s.subjectsTotal && s.subjectsEntered < s.subjectsTotal
    ? `${s.subjectsEntered} of ${s.subjectsTotal} subjects`
    : '';

// Shown when the mouse rests on the percentage: every subject with its attendance and the average
const attendanceDetail = (s) => {
  const has = (v) => v !== null && v !== undefined;
  const lines = (s.subjects || []).map((x) => {
    if (!has(x.attendance)) return `${x.subCode}: not entered`;
    // the two parts, when theory and practical attendance were entered separately
    const parts = [
      has(x.theory) ? `Theory ${x.theory}%` : '',
      has(x.practical) ? `Practical ${x.practical}%` : '',
    ].filter(Boolean);
    return `${x.subCode}: ${x.attendance}%${parts.length > 1 ? ` (${parts.join(', ')})` : ''}`;
  });
  if (s.avgAttendanceExact === null || s.avgAttendanceExact === undefined) {
    return ['Attendance not entered yet', ...lines].join('\n');
  }
  return [
    ...lines,
    `Average of ${s.subjectsEntered} subject${s.subjectsEntered === 1 ? '' : 's'}: ${s.avgAttendanceExact}%`,
  ].join('\n');
};

export default function StudentNominalRoll() {
  const [options, setOptions] = useState({});
  const [filters, setFilters] = useState({});
  const [info, setInfo] = useState(null);
  const [roll, setRoll] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [withSign, setWithSign] = useState(true);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    fetchNominalFilters()
      .then((opts) => {
        setOptions(opts);
        setFilters(
          Object.fromEntries(FILTERS.map(({ key }) => [key, opts[key]?.[0] || '']))
        );
      })
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!FILTERS.every(({ key }) => filters[key])) return;
    setLoading(true);
    setError('');
    fetchNominalRoll(filters)
      .then((data) => {
        setInfo(data.info);
        setRoll(data.roll);
      })
      .catch((e) => {
        setError(e.message);
        setRoll([]);
        setInfo(null);
      })
      .finally(() => setLoading(false));
  }, [filters]);

  const handleOpenPreview = (sign) => {
    setWithSign(sign);
    setShowPreview(true);
  };

  const handleTriggerPrint = () => {
    window.print();
  };

  const instName = info?.instName || filters.instCode || '';
  const headLabel = info?.headDesignation || 'Dean / Principal';
  const contactLine = [info?.city, info?.phone, info?.email].filter(Boolean).join('  |  ');

  return (
    <div className="nr-page">
      <div className="nr-head">
        <div>
          <h2>Student nominal roll</h2>
          <p>
            Candidates registered for the semester examination, with eligibility
            checked against the course’s minimum attendance. The attendance percentage
            is the average of the subjects entered in Attendance &amp; internal marks.
          </p>
        </div>
        <div className="nr-actions">
          <button className="nr-btn" onClick={() => handleOpenPreview(false)}>
            Nominal w/o sign
          </button>
          <button className="nr-btn primary" onClick={() => handleOpenPreview(true)}>
            Print nominal roll
          </button>
        </div>
      </div>

      <div className="nr-card">
        <div className="nr-filters">
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
          <div className="nr-info">
            <span>Inst name <b>{instName}</b></span>
            {info.degree && <span>Degree <b>{info.degree}</b></span>}
            {info.courseMode && <span>Course mode <b>{info.courseMode}</b></span>}
            {info.department && <span>Department <b>{info.department}</b></span>}
            {info.regulation && <span>Regulation <b>{info.regulation}</b></span>}
            {info.examPattern && (
              <span>Exam pattern <b>{info.examPattern} {shortSemester(filters.semester)}</b></span>
            )}
            <span>Minimum attendance <b>{info.minAttendance}%</b></span>
            {info.subjectsTotal > 0 && <span>Subjects <b>{info.subjectsTotal}</b></span>}
            {roll.length > 0 && info.eligible !== undefined && (
              <span>
                Eligible <b>{info.eligible}</b> · Not eligible <b>{info.notEligible}</b> · Pending <b>{info.pending}</b>
              </span>
            )}
          </div>
        )}

        {info?.ignoredSubjects?.length > 0 && (
          <div className="nr-info">
            <span>
              Not counted <b>{info.ignoredSubjects.join(', ')}</b>: attendance was saved under{' '}
              {info.ignoredSubjects.length > 1 ? 'these subject codes' : 'this subject code'}, but{' '}
              {info.ignoredSubjects.length > 1 ? 'they are' : 'it is'} not in this semester’s curriculum.
            </span>
          </div>
        )}

        {error && <div className="nr-error">{error}</div>}

        <table className="nr-table">
          <thead>
            <tr>
              <th>S.No</th>
              <th>Register no</th>
              <th>Student name</th>
              <th>Gender</th>
              <th>DOB</th>
              <th className="num">Avg attendance</th>
              <th>Eligibility</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="nr-empty">Loading…</td></tr>
            ) : roll.length === 0 ? (
              <tr><td colSpan={7} className="nr-empty">No candidates found</td></tr>
            ) : (
              roll.map((s) => (
                <tr key={s.regNo}>
                  <td>{s.sno}</td>
                  <td><b>{s.regNo}</b></td>
                  <td>{s.name}</td>
                  <td>{s.gender}</td>
                  <td>{formatDob(s.dob)}</td>
                  <td className="num" title={attendanceDetail(s)}>
                    {s.avgAttendance === null ? '—' : `${s.avgAttendance}%`}
                    {subjectsNote(s) && (
                      <div style={{ fontSize: 11, opacity: 0.7 }}>{subjectsNote(s)}</div>
                    )}
                  </td>
                  <td>
                    <span className={`pill ${s.eligibility.toLowerCase().replace(' ', '-')}`}>
                      {s.eligibility}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Print Preview Modal */}
      {showPreview && (
        <div className="modal-backdrop">
          <div className="modal-container">
            <div className="modal-header">
              <h3>Nominal roll</h3>
              <button className="modal-close" onClick={() => setShowPreview(false)}>×</button>
            </div>

            <div className="modal-body">
              <div className="print-root">
                <div className="ps-header">
                  <div className="ps-logo">
                    <span>{UNIVERSITY.logoText}</span>
                  </div>
                  <div className="ps-head-text">
                    <h1>{UNIVERSITY.name}</h1>
                    <p>{UNIVERSITY.line1}</p>
                    <p>{UNIVERSITY.line2}</p>
                    <h3>{instName}</h3>
                    {contactLine && <p className="ps-contact">{contactLine}</p>}
                  </div>
                </div>
                
                <h2 className="ps-title">NOMINAL ROLL</h2>
                <hr className="ps-rule" />

                <div className="ps-meta">
                  <div className="ps-meta-col">
                    <div><span>Course</span><b>{filters.course}{info?.department ? ` – ${info.department}` : ''}</b></div>
                    <div><span>Batch</span><b>{filters.batch}</b></div>
                    <div><span>Regulation</span><b>{info?.regulation}</b></div>
                  </div>
                  <div className="ps-meta-col">
                    <div><span>Month &amp; year</span><b>{filters.examYear}</b></div>
                    <div><span>Semester</span><b>{shortSemester(filters.semester)}</b></div>
                    <div><span>Student category</span><b>{filters.studentCategory}</b></div>
                  </div>
                </div>

                <table className="ps-table">
                  <thead>
                    <tr>
                      <th style={{ width: '7%' }}>S.No</th>
                      <th style={{ width: '16%' }}>Register no</th>
                      <th>Name of the candidate</th>
                      <th style={{ width: '9%' }}>Gender</th>
                      <th style={{ width: '14%' }}>DOB</th>
                      <th style={{ width: '14%' }}>Attendance %</th>
                      {withSign && <th style={{ width: '18%' }}>Signature</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {roll.map((s) => (
                      <tr key={s.regNo}>
                        <td className="c">{s.sno}</td>
                        <td>{s.regNo}</td>
                        <td>{s.name}</td>
                        <td className="c">{shortGender(s.gender)}</td>
                        <td className="c">{formatDob(s.dob)}</td>
                        <td className="c">{s.avgAttendance === null ? '—' : s.avgAttendance}</td>
                        {withSign && <td className="sign-cell" />}
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="ps-footer">
                  <div className="ps-sign"><span>{headLabel}</span></div>
                  <div className="ps-sign right"><span>Controller of Examinations</span></div>
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button className="nr-btn" onClick={() => setShowPreview(false)}>Close</button>
              <button className="nr-btn primary" onClick={handleTriggerPrint}>Print</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
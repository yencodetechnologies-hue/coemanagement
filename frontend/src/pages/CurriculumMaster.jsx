import { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, Pencil, Trash2, Eye, Search, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { curriculumApi } from '../config/CurriculumMasterapi';
import { institutionsApi } from '../config/Institutionsapi';
import { coursesApi } from '../config/Coursesapi';

const EMPTY = {
  instCode: 'SBCN',
  course: '',
  degree: 'UG',
  mode: 'REGULAR',
  regulation: '2022',
  batch: '',
  department: 'Nursing',
  semester: '1',
  subCodeP1: '',
  subNameP1: '',
  component: 'Theory',
  subjectCategory: 'CORE',
  theoryHour: '',
  subCodeP2: '',
  subNameP2: '',
  practicalHour: '',
  internalMinMark: '12.5',
  internalMaxMark: '25',
  externalMinMark: '37.5',
  externalMaxMark: '75',
  practicalIaMin: '',
  practicalIaMax: '',
  oralMin: '',
  oralMax: '',
  mcqMin: '',
  mcqMax: '',
  subCodeOther: '',
  subNameOther: '',
  otherMin: '',
  otherMax: '',
  credit: '3',
  examConductedBy: 'University',
  addedToSgpa: 'Yes',
  letterGradeAwarded: 'Yes',
  examAmount: '500',
  status: 'Active',
  verified: 'No',
  condition: ''
};

/* ---------- Term helpers ---------- */
const DEFAULT_TERMS = 8;

// Number of terms configured on the course record (Course Management).
// Change the field name here if your Course model uses a different one.
function getTermCount(course) {
  if (!course) return DEFAULT_TERMS;
  const n = Number(
    course.noOfTerms ??
    course.numberOfTerms ??
    course.totalTerms ??
    course.terms ??
    course.noOfSemesters ??
    course.totalSemesters
  );
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_TERMS;
}

function termOptions(count) {
  return Array.from({ length: count }, (_, i) => String(i + 1));
}

function toRoman(num) {
  let n = Number(num);
  if (!Number.isInteger(n) || n <= 0) return String(num ?? '');
  const map = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let out = '';
  for (const [v, s] of map) {
    while (n >= v) { out += s; n -= v; }
  }
  return out;
}

function formatSemester(sem) {
  return `Semester ${toRoman(sem)}`;
}

function formatSemesterRomanShort(sem) {
  return toRoman(sem);
}

function validate(f) {
  const e = {};
  if (!f.instCode?.trim()) e.instCode = 'Select institution code';
  if (!f.course?.trim()) e.course = 'Select course';
  if (!f.regulation?.trim()) e.regulation = 'Enter regulation';
  if (!f.semester?.trim()) e.semester = 'Select semester';
  if (!f.subCodeP1?.trim()) e.subCodeP1 = 'Enter sub code';
  if (!f.subNameP1?.trim()) e.subNameP1 = 'Enter sub name';
  if (!f.internalMinMark) e.internalMinMark = 'Enter internal min';
  if (!f.internalMaxMark) e.internalMaxMark = 'Enter internal max';
  return e;
}

function pageList(page, total) {
  const keep = [...new Set([1, total, page - 1, page, page + 1])].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  return keep.flatMap((p, i) => (i && p - keep[i - 1] > 1 ? ['…' + p, p] : [p]));
}

/* ---------- Create / Edit Modal ---------- */
function CurriculumModal({ record, defaults, institutions, coursesList, onClose, onSaved }) {
  const editing = Boolean(record);

  // Strip undefined/empty values so they don't overwrite EMPTY
  const cleanDefaults = Object.fromEntries(
    Object.entries(defaults || {}).filter(([, v]) => v !== undefined && v !== null && v !== '')
  );

  const [form, setForm] = useState(
    editing
      ? { ...EMPTY, ...record, semester: String(record.semester ?? '1') }
      : { ...EMPTY, ...cleanDefaults, semester: String(cleanDefaults.semester ?? '1') }
  );
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [saving, setSaving] = useState(false);
  const first = useRef(null);

  // Courses of the selected institution
  const availableCourses = coursesList.filter((c) => c.instCode === form.instCode);

  // Semester options follow the selected course's number of terms
  const selectedCourse = availableCourses.find((c) => c.courseName === form.course);
  const termCount = getTermCount(selectedCourse);
  const semesters = termOptions(termCount);

  // Keep the chosen semester inside the course's term range
  const clampSemester = (sem, course) => (Number(sem) > getTermCount(course) ? '1' : sem);

  useEffect(() => {
    first.current?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const set = (key) => (e) => {
    const val = e.target.type === 'checkbox' ? e.target.checked : e.target.value;

    if (key === 'instCode') {
      // When institution changes, pick the first matching course if available
      const matchingCourses = coursesList.filter((c) => c.instCode === val);
      const defaultCourse = matchingCourses.length > 0 ? matchingCourses[0] : null;

      setForm((f) => ({
        ...f,
        instCode: val,
        course: defaultCourse ? defaultCourse.courseName : '',
        degree: defaultCourse ? defaultCourse.degree : f.degree,
        mode: defaultCourse ? defaultCourse.mode : f.mode,
        department: defaultCourse ? defaultCourse.department : f.department,
        regulation: defaultCourse ? defaultCourse.regulation : f.regulation,
        semester: clampSemester(f.semester, defaultCourse)
      }));
    } else if (key === 'course') {
      // Auto-populate degree, mode, department, regulation from the selected course
      const selectedCourseObj = coursesList.find((c) => c.courseName === val && c.instCode === form.instCode);
      setForm((f) => ({
        ...f,
        course: val,
        degree: selectedCourseObj ? selectedCourseObj.degree : f.degree,
        mode: selectedCourseObj ? selectedCourseObj.mode : f.mode,
        department: selectedCourseObj ? selectedCourseObj.department : f.department,
        regulation: selectedCourseObj ? selectedCourseObj.regulation : f.regulation,
        semester: clampSemester(f.semester, selectedCourseObj)
      }));
    } else {
      setForm((f) => ({ ...f, [key]: val }));
    }

    setErrors((er) => ({ ...er, [key]: undefined }));
  };

  const submit = async (e) => {
    e.preventDefault();
    const found = validate(form);
    setErrors(found);
    if (Object.keys(found).length) return;
    setSaving(true);
    setServerError('');

    try {
      const saved = editing ? await curriculumApi.update(record._id, form) : await curriculumApi.create(form);
      onSaved(saved, editing);
    } catch (err) {
      setServerError(err.message || 'Failed to save curriculum record');
      setSaving(false);
    }
  };

  const field = (key, label, { required, span = 1, ref, type = 'text', ...rest } = {}) => (
    <label className={`form-label col-${span}`}>
      <span>{label}{required && <b className="req"> *</b>}</span>
      <input ref={ref} type={type} className={`field ${errors[key] ? 'invalid' : ''}`} value={form[key] || ''} onChange={set(key)} {...rest} />
      {errors[key] && <small className="field-error">{errors[key]}</small>}
    </label>
  );

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form className="modal" style={{ width: '950px', maxHeight: 'calc(100vh - 32px)' }} role="dialog" aria-modal="true" onSubmit={submit} noValidate>
        <div className="modal-head">
          <h2>{editing ? 'Edit curriculum master' : 'New curriculum master'}</h2>
          <button type="button" className="icon-only" aria-label="Close" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body" style={{ overflowY: 'auto' }}>
          {serverError && <p className="toast error">{serverError}</p>}

          <h3 className="modal-section">Base details</h3>
          <div className="modal-grid">
            <label className="form-label col-1">
              <span>Inst code<b className="req"> *</b></span>
              <select ref={first} className="field" value={form.instCode} onChange={set('instCode')}>
                {institutions?.map((i) => (
                  <option key={i._id} value={i.instCode}>{i.instCode} - {i.instName}</option>
                ))}
              </select>
            </label>

            <label className="form-label col-1">
              <span>Course<b className="req"> *</b></span>
              <select className={`field ${errors.course ? 'invalid' : ''}`} value={form.course} onChange={set('course')}>
                <option value="">Select course</option>
                {availableCourses?.map((c) => (
                  <option key={c._id} value={c.courseName}>{c.courseName} ({c.courseCode})</option>
                ))}
              </select>
              {errors.course && <small className="field-error">{errors.course}</small>}
            </label>

            {field('regulation', 'Regulation', { required: true })}
            {field('batch', 'Batch (blank = all)')}

            <label className="form-label col-1">
              <span>Mode<b className="req"> *</b></span>
              <select className="field" value={form.mode} onChange={set('mode')}>
                <option value="REGULAR">REGULAR</option>
                <option value="PART TIME">PART TIME</option>
                <option value="LATERAL ENTRY">LATERAL ENTRY</option>
              </select>
            </label>
            {field('department', 'Department', { required: true })}

            <label className="form-label col-1">
              <span>Year / Semester<b className="req"> *</b></span>
              <select className="field" value={form.semester} onChange={set('semester')}>
                {semesters.map((s) => (
                  <option key={s} value={s}>{formatSemester(s)}</option>
                ))}
              </select>
            </label>
          </div>

          <h3 className="modal-section" style={{ marginTop: '24px' }}>Subject details</h3>
          <div className="modal-grid">
            {field('subCodeP1', 'Sub code - P1', { required: true })}
            {field('subNameP1', 'Sub name - P1', { required: true, span: 2 })}

            <label className="form-label col-1">
              <span>Component<b className="req"> *</b></span>
              <select className="field" value={form.component} onChange={set('component')}>
                <option value="Theory">Theory</option>
                <option value="Practical">Practical</option>
                <option value="Clinical">Clinical</option>
              </select>
            </label>

            <label className="form-label col-1">
              <span>Subject category<b className="req"> *</b></span>
              <select className="field" value={form.subjectCategory} onChange={set('subjectCategory')}>
                <option value="CORE">CORE</option>
                <option value="ELECTIVE">ELECTIVE</option>
              </select>
            </label>
            {field('theoryHour', 'Theory hour', { type: 'number' })}

            {field('subCodeP2', 'Sub code - P2')}
            {field('subNameP2', 'Sub name - P2', { span: 2 })}
            {field('practicalHour', 'Practical hour', { type: 'number' })}

            {field('internalMinMark', 'Internal min mark', { required: true, type: 'number' })}
            {field('internalMaxMark', 'Internal max mark', { required: true, type: 'number' })}
            {field('externalMinMark', 'External (P1) min mark', { required: true, type: 'number' })}
            {field('externalMaxMark', 'External (P1) max mark', { required: true, type: 'number' })}

            {field('practicalIaMin', 'Practical (IA) min', { type: 'number' })}
            {field('practicalIaMax', 'Practical (IA) max', { type: 'number' })}
            {field('oralMin', 'Oral min', { type: 'number' })}
            {field('oralMax', 'Oral max', { type: 'number' })}
            {field('mcqMin', 'MCQ min', { type: 'number' })}
            {field('mcqMax', 'MCQ max', { type: 'number' })}

            {field('subCodeOther', 'Sub code - other')}
            {field('subNameOther', 'Sub name - other', { span: 2 })}
            {field('otherMin', 'Other min', { type: 'number' })}
            {field('otherMax', 'Other max', { type: 'number' })}
          </div>

          <h3 className="modal-section" style={{ marginTop: '24px' }}>Details</h3>
          <div className="modal-grid">
            {field('credit', 'Credit', { required: true, type: 'number' })}

            <label className="form-label col-1">
              <span>Exam conducted by<b className="req"> *</b></span>
              <select className="field" value={form.examConductedBy} onChange={set('examConductedBy')}>
                <option value="University">University</option>
                <option value="College">College</option>
              </select>
            </label>

            <label className="form-label col-1">
              <span>Added to SGPA<b className="req"> *</b></span>
              <select className="field" value={form.addedToSgpa} onChange={set('addedToSgpa')}>
                <option value="Yes">Yes</option>
                <option value="No">No</option>
              </select>
            </label>

            <label className="form-label col-1">
              <span>Letter grade awarded<b className="req"> *</b></span>
              <select className="field" value={form.letterGradeAwarded} onChange={set('letterGradeAwarded')}>
                <option value="Yes">Yes</option>
                <option value="No">No</option>
              </select>
            </label>

            {field('examAmount', 'Exam amount (₹)', { required: true, type: 'number' })}

            <label className="form-label col-1">
              <span>Status<b className="req"> *</b></span>
              <select className="field" value={form.status} onChange={set('status')}>
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
            </label>

            <label className="form-label col-1">
              <span>Verified<b className="req"> *</b></span>
              <select className="field" value={form.verified} onChange={set('verified')}>
                <option value="Yes">Yes</option>
                <option value="No">No</option>
              </select>
            </label>

            {field('condition', 'Condition', { span: 2 })}
          </div>
        </div>
        <div className="modal-foot">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Create record'}</button>
        </div>
      </form>
    </div>
  );
}

/* ---------- View Details Modal ---------- */
function ViewModal({ record, onClose, onEdit }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const items = [
    ['Inst code', record.instCode],
    ['Course', record.course],
    ['Regulation', record.regulation],
    ['Semester', formatSemester(record.semester)],
    ['Mode', record.mode],
    ['Department', record.department],
    ['Sub code - P1', record.subCodeP1],
    ['Sub name - P1', record.subNameP1, 2],
    ['Component', record.component],
    ['Subject category', record.subjectCategory],
    ['Credit', record.credit],
    ['Internal min/max', `${record.internalMinMark} / ${record.internalMaxMark}`],
    ['External min/max', `${record.externalMinMark} / ${record.externalMaxMark}`],
    ['Exam conducted by', record.examConductedBy],
    ['Added to SGPA', record.addedToSgpa],
    ['Exam amount', `₹${record.examAmount}`],
    ['Verified', <span key="v" className={`badge ${record.verified === 'Yes' ? 'active' : 'inactive'}`}>{record.verified === 'Yes' ? 'VERIFIED' : 'NOT VERIFIED'}</span>],
    ['Status', <span key="s" className={`badge ${record.status?.toLowerCase()}`}>{record.status}</span>],
  ];

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ width: '850px' }} role="dialog" aria-modal="true">
        <div className="modal-head">
          <h2>Curriculum Master Details</h2>
          <button type="button" className="icon-only" aria-label="Close" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body" style={{ overflowY: 'auto' }}>
          <h3 className="modal-section">Subject Overview</h3>
          <dl className="detail-grid">
            {items.map(([label, value, span = 1]) => (
              <div key={label} className={`detail col-${span}`}>
                <dt>{label}</dt>
                <dd>{value || '—'}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="modal-foot">
          <button type="button" className="btn" onClick={onClose}>Close</button>
          <button className="btn btn-primary" onClick={onEdit}><Pencil size={14} /> Edit</button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Main Component ---------- */
export default function CurriculumMaster() {
  const [rows, setRows] = useState([]);
  const [institutions, setInstitutions] = useState([]);
  const [coursesList, setCoursesList] = useState([]);
  const [meta, setMeta] = useState({ total: 0, totalPages: 1 });
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [searchText, setSearchText] = useState('');
  const [search, setSearch] = useState('');
  const [instCode, setInstCode] = useState('SBCN');
  const [course, setCourse] = useState('');
  const [semester, setSemester] = useState('1');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState(null);
  const [modal, setModal] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const reqId = useRef(0);

  useEffect(() => {
    institutionsApi.list({ page: 1, limit: 100 })
      .then((res) => {
        const items = res.items || [];
        setInstitutions(items);
        if (items.length > 0 && !instCode) {
          setInstCode(items[0].instCode);
        }
      })
      .catch((err) => console.error('Failed to load institutions', err));

    coursesApi.list({ page: 1, limit: 100 })
      .then((res) => setCoursesList(res.items || []))
      .catch((err) => console.error('Failed to load courses', err));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchText.trim()); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [searchText]);

  // Derived values from the selected inst code + course
  const currentInst = institutions.find((i) => i.instCode === instCode);
  const filteredCourses = coursesList.filter((c) => c.instCode === instCode);
  const activeCourse = filteredCourses.find((c) => c.courseName === course) || null;

  // Semester filter options follow the selected course's number of terms
  const termCount = getTermCount(activeCourse);
  const semesterFilterOptions = termOptions(termCount);

  // Auto-select the first course when the inst code changes or courses finish loading
  useEffect(() => {
    if (!filteredCourses.length) {
      if (course !== '') setCourse('');
      return;
    }
    if (!filteredCourses.some((c) => c.courseName === course)) {
      setCourse(filteredCourses[0].courseName);
      setPage(1);
    }
  }, [instCode, coursesList]); // eslint-disable-line react-hooks/exhaustive-deps

  // If the selected course has fewer terms, reset the semester
  useEffect(() => {
    if (Number(semester) > termCount) {
      setSemester('1');
      setPage(1);
    }
  }, [termCount, semester]);

  // Load the subjects for inst code + course + semester
  useEffect(() => {
    const id = ++reqId.current;
    setLoading(true);
    setError('');
    curriculumApi.list({ page, limit, search, instCode, course, semester })
      .then((d) => {
        if (id !== reqId.current) return;
        setRows(d.items);
        setMeta({ total: d.total, totalPages: d.totalPages });
        setLoading(false);
      })
      .catch((e) => { if (id === reqId.current) { setError(e.message); setLoading(false); } });
  }, [page, limit, search, instCode, course, semester, reloadKey]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  const onSaved = (saved, editing) => {
    setModal(null);
    setMsg({ type: 'ok', text: editing ? `${saved.subCodeP1} updated` : `${saved.subCodeP1} created` });
    reload();
  };

  const confirmDelete = async () => {
    try {
      await curriculumApi.remove(deleting._id);
      setMsg({ type: 'ok', text: `${deleting.subCodeP1} deleted` });
      reload();
    } catch (e) {
      setMsg({ type: 'error', text: e.message });
    }
    setDeleting(null);
  };

  const openAdd = () =>
    setModal({
      record: null,
      defaults: {
        instCode,
        course,
        semester,
        degree: activeCourse?.degree,
        mode: activeCourse?.mode,
        department: activeCourse?.department,
        regulation: activeCourse?.regulation
      }
    });

  const from = meta.total ? (page - 1) * limit + 1 : 0;
  const to = Math.min(page * limit, meta.total);

  // Total credits for this semester
  const totalCredits = rows.reduce((acc, r) => acc + Number(r.credit || 0), 0);

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Curriculum master</h1>
          <p className="page-sub">Subjects per semester with credits, pass minimum and maximum for internal and end-semester components. These values drive grading and SGPA.</p>
        </div>
        <button className="btn btn-primary" onClick={openAdd}><Plus size={15} /> Add subject</button>
      </div>

      {msg && <p className={`toast ${msg.type}`} role="status">{msg.text}</p>}

      <section className="card">
        <div className="toolbar">
          <label className="per-page">Inst code
            <select className="field" value={instCode} onChange={(e) => { setInstCode(e.target.value); setPage(1); }}>
              {institutions?.map((i) => (
                <option key={i._id} value={i.instCode}>{i.instCode}</option>
              ))}
            </select>
          </label>
          <label className="per-page">Course
            <select
              className="field"
              value={course}
              onChange={(e) => { setCourse(e.target.value); setSemester('1'); setPage(1); }}
            >
              {filteredCourses.length === 0 && <option value="">No courses</option>}
              {filteredCourses.map((c) => (
                <option key={c._id} value={c.courseName}>{c.courseName}</option>
              ))}
            </select>
          </label>
          <label className="per-page">Semester
            <select className="field" value={semester} onChange={(e) => { setSemester(e.target.value); setPage(1); }}>
              {semesterFilterOptions.map((s) => (
                <option key={s} value={s}>{formatSemester(s)}</option>
              ))}
            </select>
          </label>
          <div className="search-field">
            <Search size={15} />
            <input className="field" placeholder="Name, code or number" value={searchText} onChange={(e) => setSearchText(e.target.value)} />
          </div>
        </div>

        {/* Info banner bound to selected institution and course */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '24px', padding: '12px 20px', background: 'color-mix(in srgb, var(--bg) 80%, var(--card))', borderTop: '1px solid var(--line)', borderBottom: '1px solid var(--line)', fontSize: '13px', flexWrap: 'wrap' }}>
          <div>Inst name <strong>{currentInst ? currentInst.instName : '—'}</strong></div>
          <div>Course <strong>{activeCourse ? activeCourse.courseName : '—'}</strong></div>
          <div>Degree <strong>{activeCourse ? activeCourse.degree : 'UG'}</strong></div>
          <div>Course mode <strong>{activeCourse ? activeCourse.mode : 'REGULAR'}</strong></div>
          <div>Department <strong>{activeCourse ? activeCourse.department : 'Nursing'}</strong></div>
          <div>Regulation <strong>{activeCourse ? activeCourse.regulation : '2022'}</strong></div>
          <div>Exam pattern <strong>{semester ? `SEMESTER ${formatSemesterRomanShort(semester)}` : 'SEMESTER'}</strong></div>
          <div>Terms <strong>{termCount}</strong></div>
          <div>Credits this semester <strong>{totalCredits}</strong></div>
        </div>

        <div className={`table-responsive ${loading ? 'is-loading' : ''}`}>
          <table className="custom-table">
            <thead>
              <tr>
                <th className="sno">S.No</th>
                <th>Sem</th>
                <th>Sub code</th>
                <th>Subject name</th>
                <th>Type</th>
                <th>Credit</th>
                <th>Internal min / max</th>
                <th>External min / max</th>
                <th>Exam</th>
                <th>In SGPA</th>
                <th>Verified</th>
                <th className="num">Actions</th>
              </tr>
            </thead>
            <tbody>
              {error && <tr><td colSpan={12} className="empty error-cell">{error} <button className="btn" onClick={reload}>Retry</button></td></tr>}
              {!error && !loading && rows.length === 0 && (
                <tr><td colSpan={12} className="empty">No curriculum records match your filter criteria.</td></tr>
              )}
              {!error && rows.map((r, i) => (
                <tr key={r._id}>
                  <td data-label="S.No" className="sno">{(page - 1) * limit + i + 1}</td>
                  <td data-label="Sem"><strong>{formatSemesterRomanShort(r.semester)}</strong></td>
                  <td data-label="Sub code"><strong>{r.subCodeP1}</strong></td>
                  <td data-label="Subject name">{r.subNameP1}</td>
                  <td data-label="Type">{r.component}</td>
                  <td data-label="Credit">{r.credit}</td>
                  <td data-label="Internal min / max">{r.internalMinMark} / {r.internalMaxMark}</td>
                  <td data-label="External min / max">{r.externalMinMark} / {r.externalMaxMark}</td>
                  <td data-label="Exam">{r.examConductedBy}</td>
                  <td data-label="In SGPA">{r.addedToSgpa}</td>
                  <td data-label="Verified">
                    <span className={`badge ${r.verified === 'Yes' ? 'active' : 'inactive'}`}>
                      {r.verified === 'Yes' ? 'VERIFIED' : 'NOT VERIFIED'}
                    </span>
                  </td>
                  <td data-label="Actions" className="num">
                    <span className="row-actions end" style={{ gap: '6px' }}>
                      <button className="icon-only edit" title="View" onClick={() => setViewing(r)}><Eye size={15} /></button>
                      <button className="icon-only edit" title="Edit" onClick={() => setModal({ record: r })}><Pencil size={15} /></button>
                      <button className="icon-only" title="Delete" onClick={() => setDeleting(r)}><Trash2 size={15} /></button>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="table-footer">
          <p>{meta.total ? `Showing ${from}–${to} of ${meta.total}` : 'No records'}</p>
          <div className="footer-right">
            <label className="per-page">Rows
              <select className="field" value={limit} onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }}>
                {[10, 25, 50].map((n) => <option key={n}>{n}</option>)}
              </select>
            </label>
            <nav className="pagination" aria-label="Pagination">
              <button className="page-btn" disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="Previous page"><ChevronLeft size={15} /></button>
              {pageList(page, meta.totalPages).map((p) =>
                typeof p === 'string'
                  ? <span key={p} className="page-dots">…</span>
                  : <button key={p} className={`page-btn ${p === page ? 'active' : ''}`} aria-current={p === page ? 'page' : undefined} onClick={() => setPage(p)}>{p}</button>
              )}
              <button className="page-btn" disabled={page >= meta.totalPages} onClick={() => setPage(page + 1)} aria-label="Next page"><ChevronRight size={15} /></button>
            </nav>
          </div>
        </div>
      </section>

      {modal && (
        <CurriculumModal
          record={modal.record}
          defaults={modal.defaults}
          institutions={institutions}
          coursesList={coursesList}
          onClose={() => setModal(null)}
          onSaved={onSaved}
        />
      )}
      {viewing && <ViewModal record={viewing} onClose={() => setViewing(null)} onEdit={() => { setModal({ record: viewing }); setViewing(null); }} />}
      {deleting && (
        <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setDeleting(null); }}>
          <div className="modal small" role="alertdialog">
            <div className="modal-head">
              <h2>Delete subject</h2>
              <button type="button" className="icon-only" aria-label="Close" onClick={() => setDeleting(null)}><X size={18} /></button>
            </div>
            <div className="modal-body"><p>Delete <strong>{deleting.subNameP1}</strong> ({deleting.subCodeP1})?</p></div>
            <div className="modal-foot">
              <button className="btn" onClick={() => setDeleting(null)}>Cancel</button>
              <button className="btn btn-danger-solid" onClick={confirmDelete}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
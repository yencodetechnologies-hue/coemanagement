import  { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, Pencil, Trash2, Eye, Search, X, ChevronLeft, ChevronRight, Upload } from 'lucide-react';
import { studentsApi } from '../config/Studentsapi';
import { institutionsApi } from '../config/Institutionsapi';
import { coursesApi } from '../config/Coursesapi';

const EMPTY = {
  admissionNo: '',
  batch: '2024',
  studentName: '',
  registerNo: '',
  dob: '',
  gender: 'Female',
  code: 'SBCN',
  degree: 'UG',
  mode: 'REGULAR',
  course: '',
  department: 'Nursing',
  regulation: '2022',
  aBatch: '',
  inAdmissionDate: '',
  outLeavingDate: '',
  status: 'Active',
  fatherName: '',
  motherName: '',
  community: '',
  address1: '',
  address2: '',
  city: '',
  state: '',
  pincode: '',
  country: 'India',
  contact1: '',
  contact2: '',
  emailId: '',
  aadhaarNo: '',
  sslc: false,
  hsc: false,
  tc: false,
  nri: false,
  migration: false,
  neetAdmitCard: false,
  photoUrl: ''
};

function validate(f) {
  const e = {};
  if (!f.admissionNo?.trim()) e.admissionNo = 'Enter admission no';
  if (!f.batch?.trim()) e.batch = 'Enter batch';
  if (!f.studentName?.trim()) e.studentName = 'Enter student name';
  if (!f.registerNo?.trim()) e.registerNo = 'Enter register no';
  if (!f.dob?.trim()) e.dob = 'Enter DOB';
  if (!f.gender?.trim()) e.gender = 'Select gender';
  if (!f.code?.trim()) e.code = 'Select code';
  if (!f.degree?.trim()) e.degree = 'Select degree';
  if (!f.mode?.trim()) e.mode = 'Select mode';
  if (!f.course?.trim()) e.course = 'Select course';
  if (!f.department?.trim()) e.department = 'Enter department';
  if (!f.regulation?.trim()) e.regulation = 'Enter regulation';
  return e;
}

function pageList(page, total) {
  const keep = [...new Set([1, total, page - 1, page, page + 1])].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  return keep.flatMap((p, i) => (i && p - keep[i - 1] > 1 ? ['…' + p, p] : [p]));
}

/* ---------- Create / Edit Modal ---------- */
function StudentModal({ record, institutions, courses, onClose, onSaved }) {
  const editing = Boolean(record);
  const [form, setForm] = useState(editing ? { ...EMPTY, ...record } : EMPTY);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(record?.photoUrl || '');
  const [fileName, setFileName] = useState(record?.photoUrl ? 'Existing photo attached' : 'No file chosen');
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [saving, setSaving] = useState(false);
  const first = useRef(null);

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
    setForm((f) => ({ ...f, [key]: val }));
    setErrors((er) => ({ ...er, [key]: undefined }));
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      setFileName(selectedFile.name);
      setPreview(URL.createObjectURL(selectedFile));
    }
  };

  // Courses for the selected institution code (courses without instCode show for all)
  const courseOptions = (courses || []).filter((c) => !c.instCode || c.instCode === form.code);
  const courseMissing = form.course && !courseOptions.some((c) => c.courseName === form.course);

  const submit = async (e) => {
    e.preventDefault();
    const found = validate(form);
    setErrors(found);
    if (Object.keys(found).length) return;
    setSaving(true);
    setServerError('');

    try {
      const formData = new FormData();
      Object.keys(form).forEach((k) => {
        if (k !== 'photo' && k !== 'photoUrl' && form[k] !== null && form[k] !== undefined) {
          formData.append(k, form[k]);
        }
      });
      if (file) {
        formData.append('photo', file);
      } else if (form.photoUrl) {
        formData.append('photoUrl', form.photoUrl);
      }

      const saved = editing ? await studentsApi.update(record._id, formData) : await studentsApi.create(formData);
      onSaved(saved, editing);
    } catch (err) {
      setServerError(err.message || 'Failed to save student profile');
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
      <form className="modal" style={{ width: '950px' }} role="dialog" aria-modal="true" aria-labelledby="student-title" onSubmit={submit} noValidate>
        <div className="modal-head">
          <h2 id="student-title">{editing ? 'Edit student profile' : 'New student profile'}</h2>
          <button type="button" className="icon-only" aria-label="Close" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body">
          {serverError && <p className="toast error">{serverError}</p>}

          <div style={{ display: 'flex', gap: '20px', alignItems: 'center', background: 'var(--bg)', padding: '16px', borderRadius: '12px', marginBottom: '20px', border: '1px dashed var(--line)' }}>
            <div style={{ width: '90px', height: '110px', background: 'var(--card)', border: '1px solid var(--line)', borderRadius: '8px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', overflow: 'hidden', position: 'relative' }}>
              {preview ? (
                <img src={preview} alt="Passport preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <>
                  <Upload size={20} style={{ marginBottom: '6px', color: 'var(--accent)' }} />
                  <span style={{ fontSize: '9px', color: 'var(--muted)' }}>Passport photo</span>
                </>
              )}
            </div>
            <div>
              <p style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '8px' }}>
                Upload a passport-size photo. It is printed on the application form and hall ticket.
              </p>
              <label className="btn" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                Choose File
                <input type="file" accept="image/*" onChange={handleFileChange} style={{ display: 'none' }} />
              </label>
              <span style={{ fontSize: '12px', marginLeft: '10px', color: 'var(--text)' }}>{fileName}</span>
            </div>
          </div>

          <h3 className="modal-section">Basic detail</h3>
          <div className="modal-grid">
            {field('admissionNo', 'Admission no', { required: true, ref: first })}
            {field('batch', 'Batch', { required: true })}
            <div className="col-1"></div>
            {field('studentName', 'Student name', { required: true, span: 2 })}
            {field('registerNo', 'Register no', { required: true })}
            {field('dob', 'DOB', { required: true, type: 'date' })}
            <label className="form-label col-1">
              <span>Gender<b className="req"> *</b></span>
              <select className="field" value={form.gender || 'Female'} onChange={set('gender')}>
                <option value="Female">Female</option>
                <option value="Male">Male</option>
                <option value="Other">Other</option>
              </select>
            </label>
          </div>

          <h3 className="modal-section" style={{ marginTop: '24px' }}>Other details</h3>
          <div className="modal-grid">
            <label className="form-label col-1">
              <span>Code<b className="req"> *</b></span>
              <select className="field" value={form.code || 'SBCN'} onChange={set('code')}>
                {institutions?.map((i) => (
                  <option key={i._id} value={i.instCode}>{i.instCode} - {i.instName}</option>
                ))}
              </select>
            </label>
            <label className="form-label col-1">
              <span>Degree<b className="req"> *</b></span>
              <select className="field" value={form.degree || 'UG'} onChange={set('degree')}>
                <option value="UG">UG</option>
                <option value="PG">PG</option>
                <option value="Diploma">Diploma</option>
              </select>
            </label>
            <label className="form-label col-1">
              <span>Mode<b className="req"> *</b></span>
              <select className="field" value={form.mode || 'REGULAR'} onChange={set('mode')}>
                <option value="REGULAR">REGULAR</option>
                <option value="LATERAL">LATERAL</option>
              </select>
            </label>
            <label className="form-label col-1">
              <span>Course<b className="req"> *</b></span>
              <select className={`field ${errors.course ? 'invalid' : ''}`} value={form.course || ''} onChange={set('course')}>
                <option value="">Select course</option>
                {courseOptions.map((c) => (
                  <option key={c._id} value={c.courseName}>{c.courseName}</option>
                ))}
                {courseMissing && <option value={form.course}>{form.course}</option>}
              </select>
              {errors.course && <small className="field-error">{errors.course}</small>}
            </label>
            {field('department', 'Department', { required: true })}
            {field('regulation', 'Regulation', { required: true })}
            {field('aBatch', 'A.Batch')}
            {field('inAdmissionDate', 'In (admission date)', { type: 'date' })}
            {field('outLeavingDate', 'Out (leaving date)', { type: 'date' })}
            <label className="form-label col-1">
              <span>Status<b className="req"> *</b></span>
              <select className="field" value={form.status || 'Active'} onChange={set('status')}>
                <option>Active</option>
                <option>Inactive</option>
              </select>
            </label>
          </div>

          <h3 className="modal-section" style={{ marginTop: '24px' }}>Family & contact</h3>
          <div className="modal-grid">
            {field('fatherName', 'Father name')}
            {field('motherName', 'Mother name')}
            <label className="form-label col-1">
              <span>Community</span>
              <select className="field" value={form.community || ''} onChange={set('community')}>
                <option value="">Select community</option>
                <option value="OC">OC</option>
                <option value="BC">BC</option>
                <option value="MBC">MBC</option>
                <option value="SC/ST">SC/ST</option>
              </select>
            </label>
            {field('address1', 'Address 1', { span: 3 })}
            {field('address2', 'Address 2', { span: 3 })}
            {field('city', 'City')}
            {field('state', 'State')}
            {field('pincode', 'Pincode')}
            {field('country', 'Country')}
            {field('contact1', 'Contact 1', { inputMode: 'tel' })}
            {field('contact2', 'Contact 2', { inputMode: 'tel' })}
            {field('emailId', 'Email id', { type: 'email', span: 2 })}
          </div>

          <h3 className="modal-section" style={{ marginTop: '24px' }}>Certificates</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '16px', fontSize: '13px' }}>
            {[['sslc', 'SSLC'], ['hsc', 'HSC'], ['tc', 'TC'], ['nri', 'NRI'], ['migration', 'Migration'], ['neetAdmitCard', 'NEET admit card']].map(([key, label]) => (
              <label key={key} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input type="checkbox" checked={Boolean(form[key])} onChange={set(key)} /> {label}
              </label>
            ))}
          </div>
          <div className="modal-grid">
            {field('aadhaarNo', 'Aadhaar no')}
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

/* ---------- View Details Modal (Showing Full Details) ---------- */
function ViewModal({ record, onClose, onEdit }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const certsList = [
    record.sslc && 'SSLC',
    record.hsc && 'HSC',
    record.tc && 'TC',
    record.nri && 'NRI',
    record.migration && 'Migration',
    record.neetAdmitCard && 'NEET Admit Card'
  ].filter(Boolean).join(', ');

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ width: '900px', maxHeight: 'calc(100vh - 32px)' }} role="dialog" aria-modal="true">
        <div className="modal-head">
          <h2>Student Details</h2>
          <button type="button" className="icon-only" aria-label="Close" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body" style={{ overflowY: 'auto' }}>
          <div style={{ display: 'flex', gap: '20px', alignItems: 'center', marginBottom: '20px' }}>
            {record.photoUrl ? (
              <img src={record.photoUrl} alt="Student" style={{ width: '100px', height: '120px', objectFit: 'cover', borderRadius: '8px', border: '1px solid var(--line)' }} />
            ) : (
              <div style={{ width: '100px', height: '120px', background: 'var(--bg)', borderRadius: '8px', display: 'grid', placeItems: 'center', fontSize: '11px', color: 'var(--muted)' }}>No Photo</div>
            )}
            <div>
              <h3 style={{ margin: '0 0 4px 0', fontSize: '18px' }}>{record.studentName}</h3>
              <p style={{ margin: 0, fontSize: '13px', color: 'var(--muted)' }}>
                Register No: <strong>{record.registerNo}</strong> | Admission No: <strong>{record.admissionNo}</strong>
              </p>
            </div>
          </div>

          <h3 className="modal-section">Basic Details</h3>
          <dl className="detail-grid">
            <div className="detail"><dt>Batch</dt><dd>{record.batch || '—'}</dd></div>
            <div className="detail"><dt>DOB</dt><dd>{record.dob || '—'}</dd></div>
            <div className="detail"><dt>Gender</dt><dd>{record.gender || '—'}</dd></div>
            <div className="detail"><dt>Status</dt><dd><span className={`badge ${record.status?.toLowerCase()}`}>{record.status}</span></dd></div>
          </dl>

          <h3 className="modal-section" style={{ marginTop: '20px' }}>Other Details</h3>
          <dl className="detail-grid">
            <div className="detail"><dt>Institution Code</dt><dd>{record.code || '—'}</dd></div>
            <div className="detail"><dt>Degree</dt><dd>{record.degree || '—'}</dd></div>
            <div className="detail"><dt>Mode</dt><dd>{record.mode || '—'}</dd></div>
            <div className="detail col-2"><dt>Course</dt><dd>{record.course || '—'}</dd></div>
            <div className="detail"><dt>Department</dt><dd>{record.department || '—'}</dd></div>
            <div className="detail"><dt>Regulation</dt><dd>{record.regulation || '—'}</dd></div>
            <div className="detail"><dt>A.Batch</dt><dd>{record.aBatch || '—'}</dd></div>
            <div className="detail"><dt>Admission Date</dt><dd>{record.inAdmissionDate || '—'}</dd></div>
            <div className="detail"><dt>Leaving Date</dt><dd>{record.outLeavingDate || '—'}</dd></div>
          </dl>

          <h3 className="modal-section" style={{ marginTop: '20px' }}>Family & Contact</h3>
          <dl className="detail-grid">
            <div className="detail"><dt>Father Name</dt><dd>{record.fatherName || '—'}</dd></div>
            <div className="detail"><dt>Mother Name</dt><dd>{record.motherName || '—'}</dd></div>
            <div className="detail"><dt>Community</dt><dd>{record.community || '—'}</dd></div>
            <div className="detail col-3"><dt>Address 1</dt><dd>{record.address1 || '—'}</dd></div>
            <div className="detail col-3"><dt>Address 2</dt><dd>{record.address2 || '—'}</dd></div>
            <div className="detail"><dt>City</dt><dd>{record.city || '—'}</dd></div>
            <div className="detail"><dt>State</dt><dd>{record.state || '—'}</dd></div>
            <div className="detail"><dt>Pincode</dt><dd>{record.pincode || '—'}</dd></div>
            <div className="detail"><dt>Country</dt><dd>{record.country || '—'}</dd></div>
            <div className="detail"><dt>Contact 1</dt><dd>{record.contact1 || '—'}</dd></div>
            <div className="detail"><dt>Contact 2</dt><dd>{record.contact2 || '—'}</dd></div>
            <div className="detail col-2"><dt>Email ID</dt><dd>{record.emailId || '—'}</dd></div>
          </dl>

          <h3 className="modal-section" style={{ marginTop: '20px' }}>Certificates & Identification</h3>
          <dl className="detail-grid">
            <div className="detail col-2"><dt>Submitted Certificates</dt><dd>{certsList || 'None'}</dd></div>
            <div className="detail"><dt>Aadhaar No</dt><dd>{record.aadhaarNo || '—'}</dd></div>
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

/* ---------- Main View Page ---------- */
export default function Students() {
  const [rows, setRows] = useState([]);
  const [institutions, setInstitutions] = useState([]);
  const [courses, setCourses] = useState([]);
  const [meta, setMeta] = useState({ total: 0, totalPages: 1 });
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [searchText, setSearchText] = useState('');
  const [search, setSearch] = useState('');
  const [instCode, setInstCode] = useState('');
  const [batch, setBatch] = useState('');
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
      .then((res) => setInstitutions(res.items || []))
      .catch((err) => console.error('Failed to load institutions', err));

    coursesApi.list({ page: 1, limit: 500 })
      .then((res) => setCourses(res.items || []))
      .catch((err) => console.error('Failed to load courses', err));
  }, []);

  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchText.trim()); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [searchText]);

  useEffect(() => {
    const id = ++reqId.current;
    setLoading(true);
    setError('');
    studentsApi.list({ page, limit, search, instCode, batch })
      .then((d) => {
        if (id !== reqId.current) return;
        setRows(d.items);
        setMeta({ total: d.total, totalPages: d.totalPages });
        setLoading(false);
      })
      .catch((e) => { if (id === reqId.current) { setError(e.message); setLoading(false); } });
  }, [page, limit, search, instCode, batch, reloadKey]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  const onSaved = (saved, editing) => {
    setModal(null);
    setMsg({ type: 'ok', text: editing ? `${saved.registerNo} updated` : `${saved.registerNo} created` });
    reload();
  };

  const confirmDelete = async () => {
    try {
      await studentsApi.remove(deleting._id);
      setMsg({ type: 'ok', text: `${deleting.registerNo} deleted` });
      reload();
    } catch (e) {
      setMsg({ type: 'error', text: e.message });
    }
    setDeleting(null);
  };

  const from = meta.total ? (page - 1) * limit + 1 : 0;
  const to = Math.min(page * limit, meta.total);

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Student profile</h1>
          <p className="page-sub">Admission record of every candidate: basic detail, programme, contact and certificates submitted.</p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="btn" onClick={() => { setInstCode(''); setBatch(''); setPage(1); }}>Show all batches</button>
          <button className="btn btn-primary" onClick={() => setModal({ record: null })}><Plus size={15} /> Add student</button>
        </div>
      </div>

      {msg && <p className={`toast ${msg.type}`} role="status">{msg.text}</p>}

      <section className="card">
        <div className="toolbar">
          <label className="per-page">Inst code
            <select className="field" value={instCode} onChange={(e) => { setInstCode(e.target.value); setPage(1); }}>
              <option value="">All institutions</option>
              {institutions?.map((i) => (
                <option key={i._id} value={i.instCode}>{i.instCode}</option>
              ))}
            </select>
          </label>
          <label className="per-page">Batch
            <select className="field" value={batch} onChange={(e) => { setBatch(e.target.value); setPage(1); }}>
              <option value="">All batches</option>
              <option value="2024">2024</option>
              <option value="2023">2023</option>
              <option value="2022">2022</option>
              <option value="2021">2021</option>
              <option value="2020">2020</option>
            </select>
          </label>
          <div className="search-field">
            <Search size={15} />
            <input className="field" placeholder="Name, code or number" value={searchText} onChange={(e) => setSearchText(e.target.value)} />
          </div>
        </div>

        <div className={`table-responsive ${loading ? 'is-loading' : ''}`}>
          <table className="custom-table">
            <thead>
              <tr>
                <th>S.No</th>
                <th>Register no</th>
                <th>Student name</th>
                <th>Admission no</th>
                <th>Batch</th>
                <th>Course</th>
                <th>Gender</th>
                <th>DOB</th>
                <th>Status</th>
                <th className="num">Actions</th>
              </tr>
            </thead>
            <tbody>
              {error && <tr><td colSpan={10} className="empty error-cell">{error} <button className="btn" onClick={reload}>Retry</button></td></tr>}
              {!error && !loading && rows.length === 0 && (
                <tr><td colSpan={10} className="empty">No students match your filter criteria.</td></tr>
              )}
              {!error && rows.map((r, idx) => (
                <tr key={r._id}>
                  <td data-label="S.No">{(page - 1) * limit + idx + 1}</td>
                  <td data-label="Register no"><strong>{r.registerNo}</strong></td>
                  <td data-label="Student name">{r.studentName}</td>
                  <td data-label="Admission no">{r.admissionNo}</td>
                  <td data-label="Batch">{r.batch}</td>
                  <td data-label="Course">{r.course}</td>
                  <td data-label="Gender">{r.gender}</td>
                  <td data-label="DOB">{r.dob}</td>
                  <td data-label="Status"><span className={`badge ${r.status.toLowerCase()}`}>{r.status}</span></td>
                  <td data-label="Actions" className="num">
                    <span className="row-actions end">
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

      {modal && <StudentModal record={modal.record} institutions={institutions} courses={courses} onClose={() => setModal(null)} onSaved={onSaved} />}
      {viewing && <ViewModal record={viewing} onClose={() => setViewing(null)} onEdit={() => { setModal({ record: viewing }); setViewing(null); }} />}
      {deleting && (
        <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setDeleting(null); }}>
          <div className="modal small" role="alertdialog">
            <div className="modal-head">
              <h2>Delete student</h2>
              <button type="button" className="icon-only" aria-label="Close" onClick={() => setDeleting(null)}><X size={18} /></button>
            </div>
            <div className="modal-body"><p>Delete <strong>{deleting.studentName}</strong> ({deleting.registerNo})?</p></div>
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
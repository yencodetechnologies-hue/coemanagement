import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, Pencil, Trash2, Eye, Search, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { coursesApi } from '../config/Coursesapi';
import { institutionsApi } from '../config/Institutionsapi';

const EMPTY = {
  instCode: '',
  degree: 'UG',
  mode: 'REGULAR',
  courseCode: '',
  courseName: '',
  department: '',
  attendancePercentage: '75',
  examPattern: 'SEMESTER',
  noOfTerms: '8',
  regulation: '2022',
  status: 'Active'
};

function validate(f) {
  const e = {};
  if (!f.instCode?.trim()) e.instCode = 'Select inst code';
  if (!f.degree?.trim()) e.degree = 'Select degree';
  if (!f.mode?.trim()) e.mode = 'Select mode';
  if (!f.courseCode?.trim()) e.courseCode = 'Enter course code';
  if (!f.courseName?.trim()) e.courseName = 'Enter course name';
  if (!f.department?.trim()) e.department = 'Enter department';
  if (!f.examPattern?.trim()) e.examPattern = 'Select exam pattern';
  if (!f.regulation?.trim()) e.regulation = 'Enter regulation';

  const pct = Number(f.attendancePercentage);
  if (String(f.attendancePercentage).trim() === '' || !(pct >= 0 && pct <= 100)) {
    e.attendancePercentage = 'Enter a value from 0 to 100';
  }
  const terms = Number(f.noOfTerms);
  if (!Number.isInteger(terms) || terms < 1) e.noOfTerms = 'Enter a whole number, 1 or more';
  return e;
}

function pageList(page, total) {
  const keep = [...new Set([1, total, page - 1, page, page + 1])].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  return keep.flatMap((p, i) => (i && p - keep[i - 1] > 1 ? ['…' + p, p] : [p]));
}

/* ---------- Create / Edit Modal ---------- */
function CourseModal({ record, institutions, defaultInst, onClose, onSaved }) {
  const editing = Boolean(record);
  // FIX: a new record starts with a real inst code (the first / filtered institution),
  // because a <select> shows its first option even when the stored value is ''.
  const [form, setForm] = useState(editing ? { ...EMPTY, ...record } : { ...EMPTY, instCode: defaultInst });
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [saving, setSaving] = useState(false);
  const first = useRef(null);

  // FIX: if the institutions finish loading after the popup opened, fill the inst code in
  useEffect(() => {
    if (!editing && !form.instCode && institutions.length) {
      setForm((f) => ({ ...f, instCode: defaultInst || institutions[0].instCode }));
    }
  }, [editing, form.instCode, institutions, defaultInst]);

  useEffect(() => {
    first.current?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const set = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    setErrors((er) => ({ ...er, [key]: undefined }));
  };

  const submit = async (e) => {
    e.preventDefault();
    const found = validate(form);
    setErrors(found);
    if (Object.keys(found).length) return;
    setSaving(true);
    setServerError('');

    const payload = {
      ...form,
      instCode: form.instCode.trim(),
      attendancePercentage: Number(form.attendancePercentage),
      noOfTerms: Number(form.noOfTerms),
    };

    try {
      const saved = editing ? await coursesApi.update(record._id, payload) : await coursesApi.create(payload);
      onSaved(saved, editing);
    } catch (err) {
      setServerError(err.message || 'Failed to save course record');
      setSaving(false);
    }
  };

  const field = (key, label, { required, span = 1, ref, type = 'text', ...rest } = {}) => (
    <label className={`form-label col-${span}`}>
      <span>{label}{required && <b className="req"> *</b>}</span>
      <input ref={ref} type={type} className={`field ${errors[key] ? 'invalid' : ''}`} value={form[key] ?? ''} onChange={set(key)} {...rest} />
      {errors[key] && <small className="field-error">{errors[key]}</small>}
    </label>
  );

  // Make sure the record's own inst code is always in the list when editing
  const instList = [...institutions];
  if (editing && record.instCode && !instList.some((i) => i.instCode === record.instCode)) {
    instList.unshift({ _id: 'current', instCode: record.instCode, instName: '' });
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form className="modal" style={{ width: '900px' }} role="dialog" aria-modal="true" aria-labelledby="course-title" onSubmit={submit} noValidate>
        <div className="modal-head">
          <h2 id="course-title">{editing ? 'Edit course detail' : 'New course detail'}</h2>
          <button type="button" className="icon-only" aria-label="Close" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body">
          <h3 className="modal-section">Details</h3>
          {serverError && <p className="toast error">{serverError}</p>}

          <div className="modal-grid">
            <label className="form-label col-1">
              <span>Inst code<b className="req"> *</b></span>
              <select ref={first} className={`field ${errors.instCode ? 'invalid' : ''}`} value={form.instCode} onChange={set('instCode')}>
                {instList.length === 0 && <option value="">No institutions found. Add one first</option>}
                {instList.map((i) => (
                  <option key={i._id} value={i.instCode}>{i.instName ? `${i.instCode} - ${i.instName}` : i.instCode}</option>
                ))}
              </select>
              {errors.instCode && <small className="field-error">{errors.instCode}</small>}
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
                <option value="PART TIME">PART TIME</option>
                <option value="LATERAL ENTRY">LATERAL ENTRY</option>
              </select>
            </label>

            {field('courseCode', 'Course code', { required: true })}
            {field('courseName', 'Course name', { required: true, span: 2 })}
            {field('department', 'Department', { required: true })}
            {field('attendancePercentage', 'Attendance %', { required: true, type: 'number', min: 0, max: 100 })}

            <label className="form-label col-1">
              <span>Exam pattern<b className="req"> *</b></span>
              <select className="field" value={form.examPattern || 'SEMESTER'} onChange={set('examPattern')}>
                <option value="SEMESTER">SEMESTER</option>
                <option value="ANNUAL">ANNUAL</option>
              </select>
            </label>

            {field('noOfTerms', 'No. of terms', { required: true, type: 'number', min: 1 })}
            {field('regulation', 'Regulation', { required: true })}

            <label className="form-label col-1">
              <span>Status<b className="req"> *</b></span>
              <select className="field" value={form.status || 'Active'} onChange={set('status')}>
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
            </label>
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
    ['Degree', record.degree],
    ['Mode', record.mode],
    ['Course code', record.courseCode],
    ['Course name', record.courseName, 2],
    ['Department', record.department],
    ['Attendance %', record.attendancePercentage],
    ['Exam pattern', record.examPattern],
    ['No. of terms', record.noOfTerms],
    ['Regulation', record.regulation],
    ['Status', <span key="s" className={`badge ${record.status?.toLowerCase()}`}>{record.status}</span>],
  ];

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ width: '800px' }} role="dialog" aria-modal="true">
        <div className="modal-head">
          <h2>Course Details</h2>
          <button type="button" className="icon-only" aria-label="Close" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body">
          <h3 className="modal-section">Course Information</h3>
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

/* ---------- Main Courses Component ---------- */
export default function Courses() {
  const [rows, setRows] = useState([]);
  const [institutions, setInstitutions] = useState([]);
  const [meta, setMeta] = useState({ total: 0, totalPages: 1 });
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [searchText, setSearchText] = useState('');
  const [search, setSearch] = useState('');
  const [instCode, setInstCode] = useState('');
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
  }, []);

  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchText.trim()); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [searchText]);

  useEffect(() => {
    const id = ++reqId.current;
    setLoading(true);
    setError('');
    coursesApi.list({ page, limit, search, instCode })
      .then((d) => {
        if (id !== reqId.current) return;
        // deleted the last row on a page: go back one page
        if (d.items.length === 0 && page > 1) { setPage(d.totalPages); return; }
        setRows(d.items);
        setMeta({ total: d.total, totalPages: d.totalPages });
        setLoading(false);
      })
      .catch((e) => { if (id === reqId.current) { setError(e.message); setLoading(false); } });
  }, [page, limit, search, instCode, reloadKey]);

  useEffect(() => {
    if (!msg) return undefined;
    const t = setTimeout(() => setMsg(null), 4000);
    return () => clearTimeout(t);
  }, [msg]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  const onSaved = (saved, editing) => {
    setModal(null);
    setMsg({ type: 'ok', text: editing ? `${saved.courseCode} updated` : `${saved.courseCode} created` });
    reload();
  };

  const confirmDelete = async () => {
    try {
      await coursesApi.remove(deleting._id);
      setMsg({ type: 'ok', text: `${deleting.courseCode} deleted` });
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
          <h1 className="page-title">Course Management</h1>
          <p className="page-sub">Configure academic course details, degree programmes, exam patterns, and regulations.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setModal({ record: null })}><Plus size={15} /> Add course</button>
      </div>

      {msg && <p className={`toast ${msg.type}`} role="status">{msg.text}</p>}

      <section className="card">
        <div className="toolbar">
          <label className="per-page">Inst code
            <select className="field" value={instCode} onChange={(e) => { setInstCode(e.target.value); setPage(1); }}>
              <option value="">All institutions</option>
              {institutions.map((i) => (
                <option key={i._id} value={i.instCode}>{i.instCode}</option>
              ))}
            </select>
          </label>
          <div className="search-field">
            <Search size={15} />
            <input className="field" placeholder="Search course code, name or department" value={searchText} onChange={(e) => setSearchText(e.target.value)} aria-label="Search courses" />
          </div>
        </div>

        <div className={`table-responsive ${loading ? 'is-loading' : ''}`}>
          <table className="custom-table">
            <thead>
              <tr>
                <th className="sno">S.No</th>
                <th>Inst code</th>
                <th>Course code</th>
                <th>Course name</th>
                <th>Degree</th>
                <th>Department</th>
                <th>Regulation</th>
                <th>Status</th>
                <th className="num">Actions</th>
              </tr>
            </thead>
            <tbody>
              {error && <tr><td colSpan={9} className="empty error-cell">{error} <button className="btn" onClick={reload}>Retry</button></td></tr>}
              {!error && loading && rows.length === 0 && <tr><td colSpan={9} className="empty">Loading courses…</td></tr>}
              {!error && !loading && rows.length === 0 && (
                <tr><td colSpan={9} className="empty">{search || instCode ? 'No courses match your search.' : 'No courses found.'}</td></tr>
              )}
              {!error && rows.map((r, i) => (
                <tr key={r._id}>
                  <td data-label="S.No" className="sno">{(page - 1) * limit + i + 1}</td>
                  <td data-label="Inst code"><strong>{r.instCode}</strong></td>
                  <td data-label="Course code"><strong>{r.courseCode}</strong></td>
                  <td data-label="Course name">{r.courseName}</td>
                  <td data-label="Degree">{r.degree}</td>
                  <td data-label="Department">{r.department}</td>
                  <td data-label="Regulation">{r.regulation}</td>
                  <td data-label="Status"><span className={`badge ${r.status.toLowerCase()}`}>{r.status}</span></td>
                  <td data-label="Actions" className="num">
                    <span className="row-actions end">
                      <button className="icon-only edit" title="View" aria-label={`View ${r.courseCode}`} onClick={() => setViewing(r)}><Eye size={15} /></button>
                      <button className="icon-only edit" title="Edit" aria-label={`Edit ${r.courseCode}`} onClick={() => setModal({ record: r })}><Pencil size={15} /></button>
                      <button className="icon-only" title="Delete" aria-label={`Delete ${r.courseCode}`} onClick={() => setDeleting(r)}><Trash2 size={15} /></button>
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
        <CourseModal
          record={modal.record}
          institutions={institutions}
          defaultInst={instCode || institutions[0]?.instCode || ''}
          onClose={() => setModal(null)}
          onSaved={onSaved}
        />
      )}
      {viewing && <ViewModal record={viewing} onClose={() => setViewing(null)} onEdit={() => { setModal({ record: viewing }); setViewing(null); }} />}
      {deleting && (
        <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setDeleting(null); }}>
          <div className="modal small" role="alertdialog">
            <div className="modal-head">
              <h2>Delete course</h2>
              <button type="button" className="icon-only" aria-label="Close" onClick={() => setDeleting(null)}><X size={18} /></button>
            </div>
            <div className="modal-body"><p>Delete <strong>{deleting.courseName}</strong> ({deleting.courseCode})? This cannot be undone.</p></div>
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
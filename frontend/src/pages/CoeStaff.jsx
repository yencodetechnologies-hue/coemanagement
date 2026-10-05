import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, Pencil, Trash2, Eye, Search, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { coeStaffApi } from '../config/CoeStaffapi';
import { institutionsApi } from '../config/Institutionsapi';

const EMPTY = { 
  employeeId: '', 
  fullName: '', 
  designation: 'Data Entry Operator', 
  accessRole: 'Data Entry Operator', 
  department: '', 
  institutionScope: 'All', 
  email: '', 
  phone: '', 
  dateOfJoining: '', 
  status: 'Active' 
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^[0-9+\-\s()]{7,15}$/;

function validate(f) {
  const e = {};
  if (!f.employeeId.trim()) e.employeeId = 'Enter the employee id';
  if (!f.fullName.trim()) e.fullName = 'Enter the full name';
  if (!f.designation.trim()) e.designation = 'Select or enter designation';
  if (!f.accessRole.trim()) e.accessRole = 'Select access role';
  if (!f.institutionScope.trim()) e.institutionScope = 'Select institution scope';
  if (f.phone.trim() && !PHONE.test(f.phone.trim())) e.phone = 'Enter a valid phone number';
  if (f.email.trim() && !EMAIL.test(f.email.trim())) e.email = 'Enter a valid email';
  return e;
}

function pageList(page, total) {
  const keep = [...new Set([1, total, page - 1, page, page + 1])].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  return keep.flatMap((p, i) => (i && p - keep[i - 1] > 1 ? ['…' + p, p] : [p]));
}

/* ---------- Create / edit modal ---------- */
function StaffModal({ record, institutions, onClose, onSaved }) {
  const editing = Boolean(record);
  const [form, setForm] = useState(editing ? { ...EMPTY, ...record } : EMPTY);
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [saving, setSaving] = useState(false);
  const first = useRef(null);

  useEffect(() => {
    first.current?.focus();
    const onKey = (e) => e.key === 'Escape' && onClose();
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
    try {
      const saved = editing ? await coeStaffApi.update(record._id, form) : await coeStaffApi.create(form);
      onSaved(saved, editing);
    } catch (err) {
      setServerError(err.message);
      setSaving(false);
    }
  };

  const field = (key, label, { required, span = 1, ref, ...rest } = {}) => (
    <label className={`form-label col-${span}`}>
      <span>{label}{required && <b className="req"> *</b>}</span>
      <input ref={ref} className={`field ${errors[key] ? 'invalid' : ''}`} value={form[key]} onChange={set(key)} {...rest} />
      {errors[key] && <small className="field-error">{errors[key]}</small>}
    </label>
  );

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="modal" role="dialog" aria-modal="true" aria-labelledby="staff-title" onSubmit={submit} noValidate>
        <div className="modal-head">
          <h2 id="staff-title">{editing ? 'Edit coe staff' : 'New coe staff'}</h2>
          <button type="button" className="icon-only" aria-label="Close" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body">
          <h3 className="modal-section">Staff member</h3>
          {serverError && <p className="toast error">{serverError}</p>}
          <div className="modal-grid">
            {field('employeeId', 'Employee id', { required: true, span: 1, ref: first })}
            {field('fullName', 'Full name', { required: true, span: 2 })}
            
           <label className="form-label col-1">
              <span>Designation<b className="req"> *</b></span>
              <select className="field" value={form.designation} onChange={set('designation')}>
                <option value="Controller of Examinations">Controller of Examinations</option>
                <option value="Deputy Controller of Examinations">Deputy Controller of Examinations</option>
                <option value="Assistant Controller of Examinations">Assistant Controller of Examinations</option>
                <option value="Section Officer">Section Officer</option>
                <option value="Data Entry Operator">Data Entry Operator</option>
                <option value="External Examiner">External Examiner</option>
                <option value="Internal Examiner">Internal Examiner</option>
                <option value="Scrutinizer">Scrutinizer</option>
                <option value="Chief Superintendent">Chief Superintendent</option>
                <option value="Invigilator">Invigilator</option>
              </select>
            </label>

           <label className="form-label col-1">
              <span>Access role<b className="req"> *</b></span>
              <select className="field" value={form.accessRole} onChange={set('accessRole')}>
                <option value="Controller of Examinations">Controller of Examinations</option>
                <option value="Deputy Controller">Deputy Controller</option>
                <option value="Assistant Controller">Assistant Controller</option>
                <option value="Section Officer">Section Officer</option>
                <option value="Data Entry Operator">Data Entry Operator</option>
                <option value="Evaluator">Evaluator</option>
              </select>
            </label>

            {field('department', 'Department', { span: 1 })}

            <label className="form-label col-1">
              <span>Institution scope<b className="req"> *</b></span>
              <select className="field" value={form.institutionScope} onChange={set('institutionScope')}>
                <option value="All">All</option>
                {institutions.map((inst) => (
                  <option key={inst._id || inst.instCode} value={inst.instName}>
                    {inst.instName} ({inst.instCode})
                  </option>
                ))}
              </select>
            </label>

            {field('email', 'Email', { type: 'email' })}
            {field('phone', 'Phone', { inputMode: 'tel' })}
            {field('dateOfJoining', 'Date of joining', { type: 'date' })}

            <label className="form-label col-1">
              <span>Status<b className="req"> *</b></span>
              <select className="field" value={form.status} onChange={set('status')}>
                <option>Active</option>
                <option>Inactive</option>
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

/* ---------- View (read-only) modal ---------- */
const fmtDate = (d) => (d ? new Date(d).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—');

function ViewModal({ record, onClose, onEdit }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const items = [
    ['Employee id', record.employeeId],
    ['Full name', record.fullName, 2],
    ['Designation', record.designation],
    ['Access role', record.accessRole],
    ['Department', record.department],
    ['Institution scope', record.institutionScope],
    ['Email', record.email],
    ['Phone', record.phone],
    ['Date of joining', record.dateOfJoining || '—'],
    ['Status', <span key="s" className={`badge ${record.status.toLowerCase()}`}>{record.status}</span>],
    ['Created', fmtDate(record.createdAt)],
    ['Last updated', fmtDate(record.updatedAt)],
  ];

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="view-title">
        <div className="modal-head">
          <h2 id="view-title">Staff details</h2>
          <button className="icon-only" aria-label="Close" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body">
          <h3 className="modal-section">Staff member</h3>
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
          <button className="btn" onClick={onClose}>Close</button>
          <button className="btn btn-primary" onClick={onEdit}><Pencil size={14} /> Edit</button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Delete confirmation ---------- */
function ConfirmDelete({ record, onClose, onConfirm }) {
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal small" role="alertdialog" aria-modal="true" aria-labelledby="del-title">
        <div className="modal-head"><h2 id="del-title">Delete staff member</h2></div>
        <div className="modal-body">
          <p className="confirm-text">Delete <strong>{record.fullName}</strong> ({record.employeeId})? This cannot be undone.</p>
        </div>
        <div className="modal-foot">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-danger-solid" disabled={busy} onClick={async () => { setBusy(true); await onConfirm(); }}>
            {busy ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Page ---------- */
export default function CoeStaff() {
  const [rows, setRows] = useState([]);
  const [institutions, setInstitutions] = useState([]);
  const [meta, setMeta] = useState({ total: 0, totalPages: 1 });
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [searchText, setSearchText] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState(null);
  const [modal, setModal] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const reqId = useRef(0);

  // Fetch dynamic institutions list for the dropdown scope
  useEffect(() => {
    institutionsApi.list({ page: 1, limit: 100 })
      .then((res) => setInstitutions(res.items || []))
      .catch((err) => console.error('Failed to load institutions list', err));
  }, []);

  // Debounce the search box
  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchText.trim()); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [searchText]);

  useEffect(() => {
    const id = ++reqId.current;
    setLoading(true);
    setError('');
    coeStaffApi.list({ page, limit, search, status })
      .then((d) => {
        if (id !== reqId.current) return;
        if (d.items.length === 0 && page > 1) { setPage(d.totalPages); return; }
        setRows(d.items);
        setMeta({ total: d.total, totalPages: d.totalPages });
        setLoading(false);
      })
      .catch((e) => { if (id === reqId.current) { setError(e.message); setLoading(false); } });
  }, [page, limit, search, status, reloadKey]);

  useEffect(() => {
    if (!msg) return undefined;
    const t = setTimeout(() => setMsg(null), 4000);
    return () => clearTimeout(t);
  }, [msg]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  const onSaved = (saved, editing) => {
    setModal(null);
    setMsg({ type: 'ok', text: editing ? `${saved.employeeId} updated` : `${saved.employeeId} created` });
    reload();
  };

  const confirmDelete = async () => {
    try {
      await coeStaffApi.remove(deleting._id);
      setMsg({ type: 'ok', text: `${deleting.employeeId} deleted` });
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
          <h1 className="page-title">COE Staff</h1>
          <p className="page-sub">Manage Controller of Examinations staff members, designations, and institution access scope.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setModal({ record: null })}><Plus size={15} /> Add staff</button>
      </div>

      {msg && <p className={`toast ${msg.type}`} role="status">{msg.text}</p>}

      <section className="card">
        <div className="toolbar">
          <div className="search-field">
            <Search size={15} />
            <input className="field" placeholder="Search name, code or number" value={searchText} onChange={(e) => setSearchText(e.target.value)} aria-label="Search staff" />
          </div>
          <select className="field" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} aria-label="Filter by status">
            <option value="">All status</option>
            <option>Active</option>
            <option>Inactive</option>
          </select>
        </div>

        <div className={`table-responsive ${loading ? 'is-loading' : ''}`}>
          <table className="custom-table">
            <thead>
              <tr>
                <th className="sno">S.No</th>
                <th>Emp id</th>
                <th>Full name</th>
                <th>Designation</th>
                <th>Access role</th>
                <th>Institution scope</th>
                <th>Status</th>
                <th className="num">Actions</th>
              </tr>
            </thead>
            <tbody>
              {error && <tr><td colSpan={8} className="empty error-cell">{error} <button className="btn" onClick={reload}>Retry</button></td></tr>}
              {!error && !loading && rows.length === 0 && (
                <tr><td colSpan={8} className="empty">{search || status ? 'No staff match your search.' : 'No staff members yet. Select Add staff to add one.'}</td></tr>
              )}
              {!error && rows.map((r, i) => (
                <tr key={r._id}>
                  <td data-label="S.No" className="sno">{(page - 1) * limit + i + 1}</td>
                  <td data-label="Emp id"><strong>{r.employeeId}</strong></td>
                  <td data-label="Full name">{r.fullName}</td>
                  <td data-label="Designation">{r.designation}</td>
                  <td data-label="Access role"><span className="badge active-session">{r.accessRole}</span></td>
                  <td data-label="Institution scope">{r.institutionScope}</td>
                  <td data-label="Status"><span className={`badge ${r.status.toLowerCase()}`}>{r.status}</span></td>
                  <td data-label="Actions" className="num">
                    <span className="row-actions end">
                      <button className="icon-only edit" aria-label={`View ${r.employeeId}`} onClick={() => setViewing(r)}><Eye size={15} /></button>
                      <button className="icon-only edit" aria-label={`Edit ${r.employeeId}`} onClick={() => setModal({ record: r })}><Pencil size={15} /></button>
                      <button className="icon-only" aria-label={`Delete ${r.employeeId}`} onClick={() => setDeleting(r)}><Trash2 size={15} /></button>
                    </span>
                  </td>
                </tr>
              ))}
              {loading && rows.length === 0 && <tr><td colSpan={8} className="empty">Loading staff members…</td></tr>}
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

      {modal && <StaffModal record={modal.record} institutions={institutions} onClose={() => setModal(null)} onSaved={onSaved} />}
      {viewing && <ViewModal record={viewing} onClose={() => setViewing(null)} onEdit={() => { setModal({ record: viewing }); setViewing(null); }} />}
      {deleting && <ConfirmDelete record={deleting} onClose={() => setDeleting(null)} onConfirm={confirmDelete} />}
    </>
  );
}
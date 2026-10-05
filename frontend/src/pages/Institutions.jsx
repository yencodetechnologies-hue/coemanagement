// pages/Institutions.jsx
import { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, Pencil, Trash2, Eye, Search, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { institutionsApi } from '../config/Institutionsapi';

const EMPTY = { instCode: '', instName: '', discipline: '', headDesignation: '', city: '', phone: '', email: '', status: 'Active' };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^[0-9+\-\s()]{7,15}$/;

function validate(f) {
  const e = {};
  if (!f.instCode.trim()) e.instCode = 'Enter the inst code';
  if (!f.instName.trim()) e.instName = 'Enter the inst name';
  if (!f.discipline.trim()) e.discipline = 'Enter the discipline';
  if (f.phone.trim() && !PHONE.test(f.phone.trim())) e.phone = 'Enter a valid phone number';
  if (f.email.trim() && !EMAIL.test(f.email.trim())) e.email = 'Enter a valid email';
  return e;
}

function pageList(page, total) {
  const keep = [...new Set([1, total, page - 1, page, page + 1])].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  return keep.flatMap((p, i) => (i && p - keep[i - 1] > 1 ? ['…' + p, p] : [p]));
}

/* ---------- Create / edit modal ---------- */
function InstitutionModal({ record, onClose, onSaved }) {
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
      const saved = editing ? await institutionsApi.update(record._id, form) : await institutionsApi.create(form);
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
      <form className="modal" role="dialog" aria-modal="true" aria-labelledby="inst-title" onSubmit={submit} noValidate>
        <div className="modal-head">
          <h2 id="inst-title">{editing ? 'Edit institution' : 'New institution'}</h2>
          <button type="button" className="icon-only" aria-label="Close" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body">
          <h3 className="modal-section">Institution</h3>
          {serverError && <p className="toast error">{serverError}</p>}
          <div className="modal-grid">
            {field('instCode', 'Inst code', { required: true, span: 1, ref: first })}
            {field('instName', 'Inst name', { required: true, span: 2 })}
            {field('discipline', 'Discipline', { required: true })}
            {field('headDesignation', 'Head designation')}
            {field('city', 'City')}
            {field('phone', 'Phone', { inputMode: 'tel' })}
            {field('email', 'Email', { type: 'email' })}
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
    ['Inst code', record.instCode],
    ['Inst name', record.instName, 2],
    ['Discipline', record.discipline],
    ['Head designation', record.headDesignation],
    ['City', record.city],
    ['Phone', record.phone],
    ['Email', record.email],
    ['Status', <span key="s" className={`badge ${record.status.toLowerCase()}`}>{record.status}</span>],
    ['Created', fmtDate(record.createdAt)],
    ['Last updated', fmtDate(record.updatedAt)],
  ];

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="view-title">
        <div className="modal-head">
          <h2 id="view-title">Institution details</h2>
          <button className="icon-only" aria-label="Close" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body">
          <h3 className="modal-section">Institution</h3>
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
        <div className="modal-head"><h2 id="del-title">Delete institution</h2></div>
        <div className="modal-body">
          <p className="confirm-text">Delete <strong>{record.instName}</strong> ({record.instCode})? This cannot be undone.</p>
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
export default function Institutions() {
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({ total: 0, totalPages: 1 });
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [searchText, setSearchText] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState(null);
  const [modal, setModal] = useState(null); // { record } for create/edit
  const [deleting, setDeleting] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const reqId = useRef(0);

  // Debounce the search box; go back to page 1 on a new search
  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchText.trim()); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [searchText]);

  useEffect(() => {
    const id = ++reqId.current;
    setLoading(true);
    setError('');
    institutionsApi.list({ page, limit, search, status })
      .then((d) => {
        if (id !== reqId.current) return; // ignore out-of-date responses
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
    setMsg({ type: 'ok', text: editing ? `${saved.instCode} updated` : `${saved.instCode} created` });
    reload();
  };

  const confirmDelete = async () => {
    try {
      await institutionsApi.remove(deleting._id);
      setMsg({ type: 'ok', text: `${deleting.instCode} deleted` });
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
          <h1 className="page-title">Institutions</h1>
          <p className="page-sub">Constituent colleges and institutes that appear on hall tickets and grade statements.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setModal({ record: null })}><Plus size={15} /> New institution</button>
      </div>

      {msg && <p className={`toast ${msg.type}`} role="status">{msg.text}</p>}

      <section className="card">
        <div className="toolbar">
          <div className="search-field">
            <Search size={15} />
            <input className="field" placeholder="Search name, code or number" value={searchText} onChange={(e) => setSearchText(e.target.value)} aria-label="Search institutions" />
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
              <tr><th className="sno">S.No</th><th>Inst code</th><th>Inst name</th><th>Discipline</th><th>City</th><th>Phone</th><th>Status</th><th className="num">Actions</th></tr>
            </thead>
            <tbody>
              {error && <tr><td colSpan={8} className="empty error-cell">{error} <button className="btn" onClick={reload}>Retry</button></td></tr>}
              {!error && !loading && rows.length === 0 && (
                <tr><td colSpan={8} className="empty">{search || status ? 'No institutions match your search.' : 'No institutions yet. Select New institution to add one.'}</td></tr>
              )}
              {!error && rows.map((r, i) => (
                <tr key={r._id}>
                  <td data-label="S.No" className="sno">{(page - 1) * limit + i + 1}</td>
                  <td data-label="Inst code"><strong>{r.instCode}</strong></td>
                  <td data-label="Inst name">{r.instName}</td>
                  <td data-label="Discipline">{r.discipline}</td>
                  <td data-label="City">{r.city || '—'}</td>
                  <td data-label="Phone">{r.phone || '—'}</td>
                  <td data-label="Status"><span className={`badge ${r.status.toLowerCase()}`}>{r.status}</span></td>
                  <td data-label="Actions" className="num">
                    <span className="row-actions end">
                      <button className="icon-only edit" aria-label={`View ${r.instCode}`} onClick={() => setViewing(r)}><Eye size={15} /></button>
                      <button className="icon-only edit" aria-label={`Edit ${r.instCode}`} onClick={() => setModal({ record: r })}><Pencil size={15} /></button>
                      <button className="icon-only" aria-label={`Delete ${r.instCode}`} onClick={() => setDeleting(r)}><Trash2 size={15} /></button>
                    </span>
                  </td>
                </tr>
              ))}
              {loading && rows.length === 0 && <tr><td colSpan={8} className="empty">Loading institutions…</td></tr>}
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

      {modal && <InstitutionModal record={modal.record} onClose={() => setModal(null)} onSaved={onSaved} />}
      {viewing && <ViewModal record={viewing} onClose={() => setViewing(null)} onEdit={() => { setModal({ record: viewing }); setViewing(null); }} />}
      {deleting && <ConfirmDelete record={deleting} onClose={() => setDeleting(null)} onConfirm={confirmDelete} />}
    </>
  );
}
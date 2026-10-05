import { Fragment, useEffect, useState } from 'react';
import { getAuditFilters, getAuditLogs } from '../config/Auditlog';
import './AuditLog.css';

const EMPTY = { search: '', staffId: '', module: '', action: '', from: '', to: '' };
const NO_FILTERS = { modules: [], actions: [], staff: [] };
const PAGE_SIZE = 20;

const pad = (n) => String(n).padStart(2, '0');
const formatDateTime = (d) => {
  const t = new Date(d);
  if (Number.isNaN(t.getTime())) return '';
  const h = t.getHours();
  return `${pad(t.getDate())}-${pad(t.getMonth() + 1)}-${t.getFullYear()} ${pad(h % 12 || 12)}:${pad(t.getMinutes())} ${h < 12 ? 'AM' : 'PM'}`;
};

// "dateOfJoining" -> "Date of joining"
const fieldLabel = (f) => {
  const s = String(f).replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
};

const showValue = (v) => {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
};

const toneOf = (log) => {
  if (!log.success) return 'failed';
  if (log.action === 'Deleted' || log.action === 'Withdrew') return 'danger';
  if (log.action === 'Created' || log.action === 'Generated' || log.action === 'Issued') return 'ok';
  return 'info';
};

export default function AuditLog() {
  const [filters, setFilters] = useState(EMPTY);
  const [search, setSearch] = useState(''); // typed text, applied after a short pause
  const [lists, setLists] = useState(NO_FILTERS);
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ rows: [], total: 0, pages: 1 });
  const [openId, setOpenId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    getAuditFilters().then(setLists).catch(() => {});
  }, []);

  // apply the search text 350 ms after typing stops
  useEffect(() => {
    const t = setTimeout(() => {
      setFilters((f) => (f.search === search ? f : { ...f, search }));
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');
    getAuditLogs({ ...filters, page, limit: PAGE_SIZE })
      .then((d) => {
        if (!alive) return;
        setData(d);
        setOpenId(null);
      })
      .catch((e) => alive && setError(e.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [filters, page]);

  const setFilter = (key, value) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(1);
  };

  const clear = () => {
    setSearch('');
    setFilters(EMPTY);
    setPage(1);
  };

  const filtered = Object.values(filters).some(Boolean);
  const first = data.total ? (page - 1) * PAGE_SIZE + 1 : 0;
  const last = Math.min(page * PAGE_SIZE, data.total);

  return (
    <div className="al-page">
      <div className="al-head">
        <h1>Audit log</h1>
        <p>
          Every change made in the system: which staff made it, when, what was changed and the
          values before and after. Entries cannot be edited or deleted.
        </p>
      </div>

      {error && <p className="al-alert">{error}</p>}

      <section className="al-card">
        <div className="al-filters">
          <label className="al-field grow">
            <span>Search</span>
            <input
              type="search"
              placeholder="Staff, record or action"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <label className="al-field">
            <span>Staff</span>
            <select value={filters.staffId} onChange={(e) => setFilter('staffId', e.target.value)}>
              <option value="">All staff</option>
              {lists.staff.map((s) => (
                <option key={s.staffId} value={s.staffId}>
                  {s.name}{s.employeeId ? ` (${s.employeeId})` : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="al-field">
            <span>Section</span>
            <select value={filters.module} onChange={(e) => setFilter('module', e.target.value)}>
              <option value="">All sections</option>
              {lists.modules.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </label>
          <label className="al-field">
            <span>Action</span>
            <select value={filters.action} onChange={(e) => setFilter('action', e.target.value)}>
              <option value="">All actions</option>
              {lists.actions.map((a) => (
                <option key={a}>{a}</option>
              ))}
            </select>
          </label>
          <label className="al-field">
            <span>From</span>
            <input type="date" value={filters.from} onChange={(e) => setFilter('from', e.target.value)} />
          </label>
          <label className="al-field">
            <span>To</span>
            <input type="date" value={filters.to} onChange={(e) => setFilter('to', e.target.value)} />
          </label>
          {filtered && (
            <button type="button" className="al-btn" onClick={clear}>Clear filters</button>
          )}
        </div>

        <div className="al-table-wrap">
          <table className="al-table">
            <thead>
              <tr>
                <th style={{ width: 170 }}>Date and time</th>
                <th style={{ width: 220 }}>Staff</th>
                <th style={{ width: 120 }}>Action</th>
                <th>What changed</th>
                <th style={{ width: 90 }} />
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={5} className="al-empty">Loading…</td></tr>
              )}
              {!loading && data.rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="al-empty">
                    {filtered ? 'No entries match these filters.' : 'No changes have been recorded yet.'}
                  </td>
                </tr>
              )}
              {!loading &&
                data.rows.map((log) => {
                  const open = openId === log._id;
                  const sent = log.details?.sent;
                  return (
                    <Fragment key={log._id}>
                      <tr className={open ? 'open' : ''}>
                        <td className="al-nowrap">{formatDateTime(log.createdAt)}</td>
                        <td>
                          <b>{log.staffName}</b>
                          <small>{[log.designation, log.employeeId].filter(Boolean).join(' · ')}</small>
                        </td>
                        <td>
                          <span className={`al-pill ${toneOf(log)}`}>
                            {log.success ? log.action : `${log.action} failed`}
                          </span>
                        </td>
                        <td>
                          {log.summary.replace(/ \(failed\)$/, '')}
                          <small>
                            {log.changes?.length
                              ? `${log.changes.length} field${log.changes.length > 1 ? 's' : ''} changed: ${log.changes.map((c) => fieldLabel(c.field)).join(', ')}`
                              : log.message || log.module}
                          </small>
                        </td>
                        <td className="al-right">
                          {/* <button
                            type="button"
                            className="al-btn small"
                            onClick={() => setOpenId(open ? null : log._id)}
                            aria-expanded={open}
                          >
                            {open ? 'Hide' : 'Details'}
                          </button> */}
                        </td>
                      </tr>

                      {open && (
                        <tr className="al-detail-row">
                          <td colSpan={5}>
                            <div className="al-detail">
                              {log.changes?.length > 0 && (
                                <div>
                                  <h4>Fields changed</h4>
                                  <table className="al-changes">
                                    <thead>
                                      <tr><th>Field</th><th>Before</th><th>After</th></tr>
                                    </thead>
                                    <tbody>
                                      {log.changes.map((c) => (
                                        <tr key={c.field}>
                                          <td>{fieldLabel(c.field)}</td>
                                          <td className="from">{showValue(c.from)}</td>
                                          <td className="to">{showValue(c.to)}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}

                              {log.details?.deleted && (
                                <div>
                                  <h4>Record that was deleted</h4>
                                  <pre>{typeof log.details.deleted === 'string' ? log.details.deleted : JSON.stringify(log.details.deleted, null, 2)}</pre>
                                </div>
                              )}

                              {sent && (
                                <div>
                                  <h4>Values sent</h4>
                                  <pre>{sent.truncated ? sent.preview : JSON.stringify(sent, null, 2)}</pre>
                                </div>
                              )}

                              <dl className="al-meta">
                                <div><dt>Section</dt><dd>{log.module || '—'}</dd></div>
                                <div><dt>Result</dt><dd>{log.success ? 'Completed' : `Failed (${log.statusCode})`}{log.message ? `: ${log.message}` : ''}</dd></div>
                                <div><dt>Access role</dt><dd>{log.accessRole || '—'}</dd></div>
                                <div><dt>Request</dt><dd>{log.method} {log.path}</dd></div>
                                {log.targetId && <div><dt>Record id</dt><dd>{log.targetId}</dd></div>}
                                {log.ip && <div><dt>IP address</dt><dd>{log.ip}</dd></div>}
                              </dl>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
            </tbody>
          </table>
        </div>

        <div className="al-foot">
          <span>
            {data.total ? `Showing ${first} to ${last} of ${data.total}` : 'No entries'}
          </span>
          <div className="al-pager">
            <button type="button" className="al-btn small" onClick={() => setPage((p) => p - 1)} disabled={page <= 1 || loading}>
              Previous
            </button>
            <span>Page {page} of {data.pages}</span>
            <button type="button" className="al-btn small" onClick={() => setPage((p) => p + 1)} disabled={page >= data.pages || loading}>
              Next
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
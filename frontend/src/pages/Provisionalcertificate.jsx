import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { getConsolidatedOptions } from '../config/Consolidatedstatement'; // same dropdown lists
import { getProvisionalCertificate, issueProvisionalCertificate } from '../config/Provisionalcertificate';
import './ProvisionalCertificate.css';

const EMPTY = { instCode: '', course: '', batch: '', regNo: '' };
const ORDER = ['instCode', 'course', 'batch', 'regNo'];
const NO_OPTIONS = { instCodes: [], courses: [], batches: [], candidates: [] };
const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];

const fmt2 = (v) => (v === null || v === undefined ? '—' : Number(v).toFixed(2));

// yyyy-mm-dd or ISO date -> dd-mm-yyyy
const formatDate = (d) => {
  if (!d) return '';
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d));
  if (iso) return `${iso[3]}-${iso[2]}-${iso[1]}`;
  const dt = new Date(d);
  return Number.isNaN(dt.getTime()) ? String(d) : dt.toLocaleDateString('en-GB').replace(/\//g, '-');
};

/* ---------- the certificate (used for the preview and for printing) ---------- */
function CertificateSheet({ view }) {
  const u = view.university || {};
  const info = view.info || {};
  const c = view.candidate || {};
  const sum = view.summary || {};

  return (
    <div className="pc-sheet">
      <div className="pc-header">
        <div className="pc-logo">{u.shortName}</div>
        <div className="pc-head-text">
          <h1>{u.name}</h1>
          {u.recognition && <p>{u.recognition}</p>}
          {u.address && <p>{u.address}</p>}
        </div>
      </div>
      <h2 className="pc-title">PROVISIONAL CERTIFICATE</h2>
      <hr className="pc-rule" />

      <p className="pc-text">
        This is to certify that <b>{c.name}</b> (Register No. <b>{c.regNo}</b>) of {info.instName} has{' '}
        <b>{view.eligible ? 'passed' : 'not yet completed'}</b> the <b>{info.degreeName}</b> degree
        examination{sum.lastExamYear ? <> held in <b>{sum.lastExamYear}</b></> : null}
        {info.regulation ? ` under Regulation ${info.regulation}` : ''}
        {view.eligible && sum.cgpa !== null && sum.cgpa !== undefined ? (
          <>, with a Cumulative Grade Point Average (CGPA) of <b>{fmt2(sum.cgpa)}</b></>
        ) : null}
        .
      </p>
      <p className="pc-text">The degree will be conferred at the next convocation of the University.</p>
      <p className="pc-text">
        This provisional certificate is issued pending the award of the degree certificate.
      </p>

      <div className="pc-footer">
        <div className="pc-sign">
          <i>{view.issue ? formatDate(view.issue.issuedOn) : ''}</i>
          <span>Date of issue</span>
        </div>
        <div className="pc-sign">
          <i />
          <span>{u.signatoryTitle || 'Controller of Examinations'}</span>
        </div>
      </div>
    </div>
  );
}

function Field({ label, wide, children }) {
  return (
    <label className={`pc-field ${wide ? 'wide' : ''}`}>
      <span>{label}</span>
      {children}
    </label>
  );
}

export default function ProvisionalCertificate() {
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
        const o = await getConsolidatedOptions({
          instCode: filters.instCode, course: filters.course, batch: filters.batch,
        });
        if (!alive) return;
        setOptions({ ...NO_OPTIONS, ...o });
        const pick = (cur, list) => (list.includes(cur) ? cur : list[0] || '');
        const next = {
          instCode: pick(filters.instCode, o.instCodes || []),
          course: pick(filters.course, (o.courses || []).map((c) => c.courseCode)),
          batch: pick(filters.batch, o.batches || []),
          regNo: pick(filters.regNo, (o.candidates || []).map((c) => c.regNo)),
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
      setView(await getProvisionalCertificate(filters));
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

  const eligible = !!view?.eligible;
  const sum = view?.summary || {};
  const total = sum.totalSemesters || 0;
  const otherBatches = (view?.completedBatches || []).filter((b) => b !== filters.batch);

  // record the issue (the server refuses a candidate who is not eligible), then print
  const onPrint = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const issued = await issueProvisionalCertificate(filters);
      setView(issued);
      setTimeout(() => window.print(), 300); // let the certificate render with its date first
    } catch (e) {
      setMsg({ ok: false, text: e.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pc-page">
      <div className="pc-head">
        <div>
          <h1>Provisional certificate</h1>
          <p>
            Issued to candidates who have cleared all {total ? WORDS[total] || total : ''} semesters,
            pending the degree at convocation.
          </p>
        </div>
        <div className="pc-actions">
          <button
            type="button"
            className="pc-btn primary"
            onClick={onPrint}
            disabled={busy || loading || !eligible}
            title={view && !eligible ? 'This candidate is not eligible' : undefined}
          >
            {busy ? 'Preparing…' : 'Print certificate'}
          </button>
        </div>
      </div>

      {msg && <p className={`pc-alert ${msg.ok ? 'ok' : 'error'}`}>{msg.text}</p>}

      <section className="pc-card">
        <div className="pc-filters">
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
                <option key={c.courseCode} value={c.courseCode}>{c.courseCode}</option>
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
          <Field label="Candidate" wide>
            <select
              value={filters.regNo}
              onChange={(e) => setFilter('regNo', e.target.value)}
              disabled={!options.candidates.length}
            >
              {!options.candidates.length && <option value="">No candidates</option>}
              {options.candidates.map((c) => (
                <option key={c.regNo} value={c.regNo}>{c.regNo} {c.name}</option>
              ))}
            </select>
          </Field>
        </div>

        {view && (
          <div className="pc-status">
            {eligible ? (
              <>
                <span className="pc-pill ok">Eligible</span>
                <span>
                  All {total} semesters cleared with CGPA {fmt2(sum.cgpa)}.
                  {view.issue
                    ? ` Issued on ${formatDate(view.issue.issuedOn)}, printed ${view.issue.printCount} time${view.issue.printCount === 1 ? '' : 's'}.`
                    : ' Not issued yet.'}
                </span>
              </>
            ) : (
              <>
                <span className="pc-pill bad">Not eligible</span>
                <span>
                  This candidate has incomplete semesters or arrears. {view.reasons.join(' ')}
                  {otherBatches.length > 0 &&
                    ` Batch ${otherBatches.join(', ')} ${otherBatches.length > 1 ? 'have' : 'has'} results for all semesters.`}
                </span>
              </>
            )}
          </div>
        )}

        <div className="pc-preview">
          {loading ? (
            <p className="pc-empty">Loading…</p>
          ) : view ? (
            <CertificateSheet view={view} />
          ) : (
            <p className="pc-empty">Select a candidate.</p>
          )}
        </div>
      </section>

      {/* printable copy (portal into <body>, hidden on screen); only an eligible certificate is printed */}
      {createPortal(
        <div className="print-root pc-print">{eligible && <CertificateSheet view={view} />}</div>,
        document.body
      )}
    </div>
  );
}
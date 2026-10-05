import { useCallback, useEffect, useRef, useState } from 'react';
import {
  errMsg,
  generateBarcodes,
  getBarcodeMapping,
  getBarcodeOptions,
  removeBarcodeMapping,
  verifyBarcodeMapping,
} from '../config/Barcode';
import './Exambarcode.css';

const ORDER = ['instCode', 'course', 'batch', 'semester', 'examYear', 'subCode'];
const EMPTY = { instCode: '', course: '', batch: '', semester: '', examYear: '', subCode: '' };
const NO_OPTIONS = { instCodes: [], courses: [], batches: [], semesters: [], examYears: [], subjects: [] };

// a manually entered barcode: 3 to 20 letters, digits or hyphens (same rule as the server)
const BARCODE_RE = /^[A-Za-z0-9-]{3,20}$/;

// The subject list has one entry per subject code AND type ("CODE::THEORY", "CODE::PRACTICAL"),
// so the practical paper of a code can be chosen. Older servers send only the code.
const subjectValue = (s) => s.value || s.code;

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-GB').replace(/\//g, '-') : '');
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function Field({ label, children }) {
  return (
    <label className="eb-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

// printable copy for the controller of examinations
function printMapping(view, filters) {
  const w = window.open('', '_blank', 'width=900,height=1000');
  if (!w) {
    alert('Please allow pop-ups to print.');
    return;
  }
  const i = view.info || {};
  const s = view.subject || {};
  const mapped = view.rows.filter((r) => r.barcode); // candidates without a barcode are not printed
  const rows = mapped
    .map((r, n) => `<tr><td>${n + 1}</td><td>${esc(r.regNo)}</td><td>${esc(r.barcode)}</td></tr>`)
    .join('');
  w.document.write(`<!doctype html><html><head><title>Bar code mapping</title><style>
    body{font-family:Georgia,'Times New Roman',serif;margin:32px;color:#111}
    h1{text-align:center;font-size:20px;margin:4px 0}h2{text-align:center;font-size:15px;margin:2px 0 14px;font-weight:normal}
    .box{border:1px solid #111;padding:8px 12px;display:grid;grid-template-columns:1fr 1fr;gap:4px 24px;font-size:13px;margin-bottom:14px}
    table{width:100%;border-collapse:collapse;font-size:13px}th,td{border:1px solid #111;padding:6px 8px;text-align:left}
    th{background:#f1f1f1}.foot{margin-top:48px;display:flex;justify-content:space-between;font-size:13px}
    .status{float:right;border:2px solid #111;padding:2px 8px;font-size:12px;letter-spacing:.08em}
  </style></head><body>
    <h1>${esc(i.instName || filters.instCode)}</h1>
    <h2>BAR CODE MAPPING - ${esc(filters.examYear)} <span class="status">${esc(view.status)}</span></h2>
    <div class="box">
      <div><b>Course:</b> ${esc(filters.course)}</div><div><b>Batch:</b> ${esc(filters.batch)}</div>
      <div><b>Regulation:</b> ${esc(i.regulation)}</div><div><b>Semester:</b> ${esc(filters.semester)}</div>
      <div><b>Subject:</b> ${esc(s.code)}${s.code2 ? ' / ' + esc(s.code2) : ''} (${esc(s.type)})</div>
      <div><b>Subject name:</b> ${esc([s.name, s.name2].filter(Boolean).join(' & '))}</div>
      <div><b>Scripts:</b> ${mapped.length}</div><div><b>Mapped on:</b> ${esc(fmtDate(view.mappedOn))}</div>
    </div>
    <table><thead><tr><th style="width:8%">S.No</th><th>Register no</th><th>Barcode number</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="foot"><span>Prepared by</span><span>Controller of Examinations</span></div>
  </body></html>`);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 300);
}

export default function BarcodeMapping() {
  const [filters, setFilters] = useState(EMPTY);
  const [options, setOptions] = useState(NO_OPTIONS);
  const [view, setView] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null); // { ok, text }

  // manual entry: barcodes typed or scanned in, one per register number
  const [manual, setManual] = useState(false);
  const [codes, setCodes] = useState({}); // regNo -> typed barcode
  const inputs = useRef([]);

  // cascading filters: load the lists, then select the first valid value of each
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const o = await getBarcodeOptions(filters);
        if (!alive) return;
        setOptions({ ...NO_OPTIONS, ...o });
        const pick = (cur, list) => (list.includes(cur) ? cur : list[0] || '');
        const next = {
          instCode: pick(filters.instCode, o.instCodes || []),
          course: pick(filters.course, (o.courses || []).map((c) => c.courseCode)),
          batch: pick(filters.batch, o.batches || []),
          semester: pick(filters.semester, o.semesters || []),
          examYear: pick(filters.examYear, o.examYears || []),
          subCode: pick(filters.subCode, (o.subjects || []).map(subjectValue)),
        };
        if (JSON.stringify(next) !== JSON.stringify(filters)) setFilters(next);
      } catch (e) {
        if (alive) setMsg({ ok: false, text: errMsg(e) });
      }
    })();
    return () => {
      alive = false;
    };
  }, [filters]);

  const complete = ORDER.every((k) => filters[k]);

  const loadMapping = useCallback(async () => {
    if (!complete) {
      setView(null);
      return;
    }
    setLoading(true);
    try {
      setView(await getBarcodeMapping(filters));
    } catch (e) {
      setView(null);
      setMsg({ ok: false, text: errMsg(e) });
    } finally {
      setLoading(false);
    }
  }, [filters, complete]);

  useEffect(() => {
    loadMapping();
  }, [loadMapping]);

  // another paper selected: leave manual entry
  useEffect(() => {
    setManual(false);
  }, [filters]);

  const setFilter = (key, value) =>
    setFilters((f) => {
      const next = { ...f, [key]: value };
      ORDER.slice(ORDER.indexOf(key) + 1).forEach((k) => {
        next[k] = ''; // reset the filters below
      });
      return next;
    });

  const run = async (fn, okText) => {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      await loadMapping();
      if (okText) setMsg({ ok: true, text: okText });
      return true;
    } catch (e) {
      setMsg({ ok: false, text: errMsg(e) });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const onGenerate = () => {
    if (
      view?.mapped &&
      !window.confirm('Regenerate all barcodes? The old barcodes and any packets made from them will be replaced.')
    )
      return;
    run(() => generateBarcodes(filters), 'Barcodes generated.');
  };

  const onRemove = () => {
    if (!window.confirm('Remove this mapping? Any packets made from it will also be removed.')) return;
    run(() => removeBarcodeMapping(view.mappingId), 'Mapping removed.');
  };

  // candidates who joined the list after the barcodes were made: give only them a barcode
  const onAddMissing = () =>
    run(() => generateBarcodes({ ...filters, addMissing: true }), 'Barcodes added for the new candidates.');

  // deleted students whose script already has a mark are kept until this is confirmed
  const onRemoveDeleted = () => {
    if (!window.confirm('Remove the deleted students from this mapping? Their barcodes and the marks entered for them will be removed.')) return;
    run(() => generateBarcodes({ ...filters, removeDeleted: true }), 'Deleted students removed from the mapping.');
  };

  const onVerify = () => {
    if (!window.confirm('Verify and lock this mapping? It cannot be changed afterwards.')) return;
    run(() => verifyBarcodeMapping(view.mappingId), 'Mapping verified.');
  };

  const info = view?.info || {};
  const subject = view?.subject || {};
  const rows = view?.rows || [];                                        // EVERY student of the batch
  const verified = view?.status === 'VERIFIED';
  const unmappedCount = view?.unmappedCount || 0;                       // candidates still without a barcode
  const mappedCount = view?.mapped ? rows.filter((r) => r.barcode).length : 0;
  // the students who get a barcode: present for this paper (not absent, not left out)
  const candidates = rows.filter((r) => !r.absent && !r.excluded && !r.noLongerCandidate);
  const candidateIndex = new Map(candidates.map((r, i) => [r.regNo, i]));
  const deletedCount = rows.filter((r) => r.deleted).length; // deleted students still mapped (a mark is entered)
  const absentCount = rows.filter((r) => r.absent && !r.deleted).length;
  const excludedCount = rows.filter((r) => r.excluded).length;

  /* ---------------- manual entry ---------------- */
  const startManual = () => {
    setCodes(Object.fromEntries(candidates.map((r) => [r.regNo, r.barcode || ''])));
    setMsg(null);
    setManual(true);
    setTimeout(() => {
      const first = candidates.findIndex((r) => !r.barcode);
      inputs.current[first < 0 ? 0 : first]?.focus();
    }, 0);
  };

  // what is wrong with one typed barcode ('' when fine)
  const typed = candidates.map((r) => String(codes[r.regNo] || '').trim());
  const problemOf = (i) => {
    const v = typed[i];
    if (!v) return 'Required';
    if (!BARCODE_RE.test(v)) return '3 to 20 letters or digits';
    if (typed.indexOf(v) !== typed.lastIndexOf(v)) return 'Entered twice';
    return '';
  };
  const filled = typed.filter(Boolean).length;

  // Enter (also sent by a barcode scanner) and the arrow keys move between the boxes
  const onCodeKey = (e, i) => {
    if (e.key === 'Enter' || e.key === 'ArrowDown') {
      e.preventDefault();
      inputs.current[i + 1]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      inputs.current[i - 1]?.focus();
    }
  };

  const onSaveManual = async () => {
    const firstBad = candidates.findIndex((_, i) => problemOf(i));
    if (firstBad >= 0) {
      inputs.current[firstBad]?.focus();
      setMsg({ ok: false, text: `Correct the highlighted barcodes. ${candidates[firstBad].regNo}: ${problemOf(firstBad).toLowerCase()}.` });
      return;
    }
    const changed = candidates.some((r, i) => (r.barcode || '') !== typed[i]);
    if (
      view?.mapped && changed &&
      !window.confirm('Replace the barcodes of this paper? Any packets made from the old barcodes will be removed.')
    )
      return;
    const entries = candidates.map((r, i) => ({ regNo: r.regNo, barcode: typed[i] }));
    // same route as "Generate barcodes"; sending the entries makes it a manual mapping
    const saved = await run(() => generateBarcodes({ ...filters, entries }), 'Barcodes saved.');
    if (saved) setManual(false);
  };

  return (
    <div className="eb-page">
      <div className="eb-head">
        <div>
          <h1>Bar code mapping</h1>
          <p>
            Assign a random barcode to every answer script so evaluators never see register numbers.
            <br />
            Every student of the batch is listed. A student marked absent for the paper on the
            Attendance &amp; internal marks sheet is shown as Absent and gets no barcode.
          </p>
        </div>
        <div className="eb-actions">
          {manual ? (
            <>
              <button type="button" className="eb-btn outline" onClick={() => setManual(false)} disabled={busy}>
                Cancel
              </button>
              <button type="button" className="eb-btn primary" onClick={onSaveManual} disabled={busy}>
                {busy ? 'Saving…' : 'Save barcodes'}
              </button>
            </>
          ) : (
            <>
              {view?.mapped && !verified && (
                <button type="button" className="eb-btn danger-outline" onClick={onRemove} disabled={busy}>
                  Remove mapping
                </button>
              )}
              <button
                type="button"
                className="eb-btn outline"
                onClick={() => printMapping(view, filters)}
                disabled={!view?.mapped}
              >
                Print mapping
              </button>
              <button
                type="button"
                className="eb-btn outline"
                onClick={startManual}
                disabled={busy || loading || !view || verified || candidates.length === 0}
              >
                Enter manually
              </button>
              <button
                type="button"
                className="eb-btn primary"
                onClick={onGenerate}
                disabled={busy || !view || verified || candidates.length === 0}
              >
                {view?.mapped ? 'Regenerate barcodes' : 'Generate barcodes'}
              </button>
            </>
          )}
        </div>
      </div>

      {msg && <p className={`eb-alert ${msg.ok ? 'ok' : 'error'}`}>{msg.text}</p>}

      <section className="eb-card">
        <div className="eb-filters">
          <Field label="Inst code">
            <select value={filters.instCode} onChange={(e) => setFilter('instCode', e.target.value)} disabled={manual}>
              {options.instCodes.map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </Field>
          <Field label="Course code">
            <select value={filters.course} onChange={(e) => setFilter('course', e.target.value)} disabled={manual}>
              {options.courses.map((c) => (
                <option key={c.courseCode} value={c.courseCode}>
                  {c.courseCode}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Batch">
            <select value={filters.batch} onChange={(e) => setFilter('batch', e.target.value)} disabled={manual}>
              {options.batches.map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </Field>
          <Field label="Semester">
            <select value={filters.semester} onChange={(e) => setFilter('semester', e.target.value)} disabled={manual}>
              {options.semesters.map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </Field>
          <Field label="Year of exam">
            <select value={filters.examYear} onChange={(e) => setFilter('examYear', e.target.value)} disabled={manual}>
              {options.examYears.map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </Field>
        </div>

        <div className="eb-filters eb-subject">
          <Field label="Subject code 1">
            <select
              className="wide"
              value={filters.subCode}
              onChange={(e) => setFilter('subCode', e.target.value)}
              disabled={manual}
            >
              {options.subjects.map((s) => (
                <option key={subjectValue(s)} value={subjectValue(s)}>
                  {s.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Subject type">
            <input readOnly value={subject.type || ''} />
          </Field>
          <Field label="Date">
            <input readOnly value={view?.schedule?.date || 'Not scheduled'} />
          </Field>
          <Field label="Session">
            <input readOnly value={view?.schedule?.session || ''} />
          </Field>
          {view && <span className={`eb-stamp ${verified ? 'verified' : ''}`}>{view.status}</span>}
        </div>

        <div className="eb-info">
          <span>Inst name <b>{info.instName}</b></span>
          <span>Degree <b>{info.degree}</b></span>
          <span>Course mode <b>{info.courseMode}</b></span>
          <span>Department <b>{info.department}</b></span>
          <span>Regulation <b>{info.regulation}</b></span>
          <span>Exam pattern <b>{info.examPattern}</b></span>
          <span>Subject name 1 <b>{subject.name}</b></span>
          {subject.code2 && <span>Subject name 2 <b>{subject.name2}</b></span>}
          <span>Subject category <b>{subject.category}</b></span>
        </div>

        {manual && (
          <div className="eb-manual-bar">
            <b>Manual entry.</b> Type or scan the barcode printed on each answer script. Enter moves
            to the next candidate. <span>{filled} of {candidates.length} entered</span>
          </div>
        )}

        <div className="eb-table-wrap">
          <table className="eb-table">
            <thead>
              <tr>
                <th style={{ width: '8%' }}>S.No</th>
                <th>Register no</th>
                <th>Barcode number</th>
                <th>{manual ? 'Check' : 'Packet'}</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={4} className="eb-empty">Loading…</td></tr>
              )}
              {!loading && rows.length === 0 && (
                <tr><td colSpan={4} className="eb-empty">No students found for this batch.</td></tr>
              )}
              {!loading &&
                rows.map((r, i) => {
                  // position among the candidates (the rows that take a barcode), or undefined
                  const ci = candidateIndex.get(r.regNo);
                  const editable = manual && ci !== undefined;
                  const problem = editable ? problemOf(ci) : '';
                  return (
                    <tr key={r.regNo}>
                      <td>{i + 1}</td>
                      <td><b>{r.regNo}</b></td>
                      <td>
                        {editable ? (
                          <input
                            ref={(el) => { inputs.current[ci] = el; }}
                            className={`eb-code ${typed[ci] && problem ? 'bad' : ''}`}
                            type="text"
                            maxLength={20}
                            autoComplete="off"
                            spellCheck={false}
                            value={codes[r.regNo] ?? ''}
                            onChange={(e) => setCodes((c) => ({ ...c, [r.regNo]: e.target.value }))}
                            onKeyDown={(e) => onCodeKey(e, ci)}
                            aria-label={`Barcode for ${r.regNo}`}
                          />
                        ) : r.barcode ? (
                          <b>{r.barcode}</b>
                        ) : r.absent ? (
                          <span className="eb-pill pending">Absent</span>
                        ) : r.excluded ? (
                          <span className="eb-pill pending">Not a candidate</span>
                        ) : r.unmapped ? (
                          <span className="eb-pill progress">Not mapped yet</span>
                        ) : (
                          <b>—</b>
                        )}
                      </td>
                      <td>
                        {editable ? (
                          <span className={`eb-pill ${!typed[ci] ? 'pending' : problem ? 'progress' : 'done'}`}>
                            {!typed[ci] ? 'Not entered' : problem || 'OK'}
                          </span>
                        ) : r.deleted ? (
                          <span className="muted">Student deleted · mark entered{r.packetNo ? ` · Packet ${r.packetNo}` : ''}</span>
                        ) : r.packetNo ? (
                          `Packet ${r.packetNo}`
                        ) : r.excluded ? (
                          <span className="muted">{r.excluded}</span>
                        ) : r.absent ? (
                          <span className="muted">{r.barcode ? 'marked absent after mapping' : 'marked absent for this paper'}</span>
                        ) : r.noLongerCandidate ? (
                          <span className="muted">no longer a candidate</span>
                        ) : (
                          '–'
                        )}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>

        <div className="eb-foot">
          {view?.mapped && !verified && !manual && (
            <button type="button" className="eb-btn primary" onClick={onVerify} disabled={busy}>
              Verify mapping
            </button>
          )}
          {view?.mapped && deletedCount > 0 && !manual && (
            <button type="button" className="eb-btn danger-outline" onClick={onRemoveDeleted} disabled={busy}>
              Remove deleted students
            </button>
          )}
          {view?.mapped && unmappedCount > 0 && !manual && (
            <button type="button" className="eb-btn primary" onClick={onAddMissing} disabled={busy}>
              Add missing barcodes
            </button>
          )}
          <span>
            {view?.mapped
              ? `${mappedCount} scripts mapped on ${fmtDate(view.mappedOn)}${view.mode === 'MANUAL' ? ' · entered manually' : ''}${verified ? ` · verified on ${fmtDate(view.verifiedOn)}` : ''}`
              : `${candidates.length} candidates present · barcodes not generated yet`}
            {` · ${rows.length} students listed`}
            {absentCount > 0 && ` · ${absentCount} absent`}
            {excludedCount > 0 && ` · ${excludedCount} not a candidate`}
          </span>
          {deletedCount > 0 && (
            <span className="eb-warn">
              {deletedCount} deleted student{deletedCount > 1 ? 's are' : ' is'} still mapped because a mark is already entered.
            </span>
          )}
          {unmappedCount > 0 && (
            <span className="eb-warn">
              {unmappedCount} candidate{unmappedCount > 1 ? 's have' : ' has'} no barcode yet. “Add missing barcodes”
              keeps the existing barcodes and adds the new ones.
            </span>
          )}
          {view?.candidatesChanged && unmappedCount === 0 && !verified && (
            <span className="eb-warn">Candidate list changed since mapping. Regenerate barcodes.</span>
          )}
        </div>
      </section>
    </div>
  );
}
import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchPackets, fetchPacket, savePacketMarks } from '../config/Externalmarkentry';
import './externalmarkentry.css';

const keyOf = (p) => `${p.rebundleId}:${p.packetNo}`;
const fmt = (v) => (Number.isFinite(Number(v)) ? String(Number(v)) : '—');

// what the "Check" column shows for one typed value
const checkOf = (value, min, max) => {
  if (value === '' || value === null || value === undefined) {
    return { tone: 'pending', text: 'Not entered' };
  }
  const m = Number(value);
  if (!Number.isFinite(m) || m < 0 || m > max) {
    return { tone: 'bad', text: `Enter 0 to ${fmt(max)}` };
  }
  return m >= min
    ? { tone: 'ok', text: 'Above minimum' }
    : { tone: 'low', text: 'Below minimum' };
};

/* ---------- styles of the packet list (kept in this file, so only one file has to be replaced) ----------
   Colours come from the dashboard variables. The .eme-page prefix is needed because dashboard.css
   resets font and colour on every button, input and select. */
const STYLES = `
.eme-page .emx-tools { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 12px 14px; padding: 16px 20px 14px; border-bottom: 1px solid var(--line); }
.eme-page .emx-search { flex: 1 1 240px; max-width: 340px; }
.eme-page .emx-search input { width: 100%; }
.eme-page .emx-tabs { display: inline-flex; margin-left: auto; border: 1px solid var(--line); border-radius: 8px; overflow: hidden; background: var(--card); }
.eme-page .emx-tab { height: 36px; padding: 0 14px; border: 0; border-right: 1px solid var(--line); background: transparent; font-size: 13px; font-weight: 600; color: var(--muted); cursor: pointer; }
.eme-page .emx-tab:last-child { border-right: 0; }
.eme-page .emx-tab b { margin-left: 6px; font-weight: 700; }
.eme-page .emx-tab.on { background: var(--navy); color: #fff; }
.dashboard-container[data-theme='dark'] .eme-page .emx-tab.on { background: var(--gold); color: #101d5c; }
.eme-page .emx-list { max-height: 300px; overflow-y: auto; }
.eme-page .emx-list table { width: 100%; border-collapse: collapse; text-align: left; font-size: 14px; }
.eme-page .emx-list th { position: sticky; top: 0; z-index: 1; padding: 10px 20px; font-size: 12px; font-weight: 600; color: var(--muted); background: color-mix(in srgb, var(--bg) 60%, var(--card)); border-bottom: 1px solid var(--line); white-space: nowrap; }
.eme-page .emx-list td { padding: 10px 20px; border-bottom: 1px solid var(--line); vertical-align: middle; }
.eme-page .emx-list tr:last-child td { border-bottom: 0; }
.eme-page .emx-list .num { text-align: right; white-space: nowrap; }
.eme-page .emx-row { cursor: pointer; }
.eme-page .emx-row:hover td { background: color-mix(in srgb, var(--accent) 5%, transparent); }
.eme-page .emx-row.on td { background: color-mix(in srgb, var(--accent) 10%, transparent); }
.eme-page .emx-row.on td:first-child { box-shadow: inset 3px 0 0 var(--navy); }
.dashboard-container[data-theme='dark'] .eme-page .emx-row.on td:first-child { box-shadow: inset 3px 0 0 var(--gold); }
.eme-page .emx-pick { display: block; width: 100%; padding: 0; border: 0; background: none; text-align: left; font-size: 14px; font-weight: 700; color: var(--text); cursor: pointer; }
.eme-page .emx-sub { display: block; margin-top: 2px; font-size: 12px; font-weight: 400; color: var(--muted); }
.eme-page .emx-bar { display: inline-block; width: 72px; height: 5px; margin-right: 10px; vertical-align: middle; border-radius: 999px; background: color-mix(in srgb, var(--muted) 18%, transparent); overflow: hidden; }
.eme-page .emx-bar span { display: block; height: 100%; border-radius: 999px; background: var(--ok-text); }
.eme-page .emx-title { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px 16px; padding: 14px 20px; border-bottom: 1px solid var(--line); }
.eme-page .emx-title h3 { margin: 0; font-family: var(--serif); font-size: 16px; font-weight: 600; color: var(--text); }
.eme-page .emx-title p { margin: 2px 0 0; font-size: 12px; color: var(--muted); }
@media (max-width: 768px) { .eme-page .emx-tabs { margin-left: 0; width: 100%; } .eme-page .emx-tab { flex: 1; padding: 0 8px; } }
`;

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
// "SEP-2026" -> a number that sorts by date
const yearOrder = (y) => {
  const m = /([A-Za-z]{3})[A-Za-z]*[\s\-/]*(\d{4})/.exec(String(y || ''));
  return m ? Number(m[2]) * 12 + Math.max(0, MONTHS.indexOf(m[1].toUpperCase())) : 0;
};

// progress of one packet
const stateOf = (p) => {
  const scripts = Number(p.scripts) || 0;
  const entered = Number(p.entered) || 0;
  if (scripts > 0 && entered >= scripts) return { key: 'done', tone: 'ok', text: 'Completed' };
  if (entered > 0) return { key: 'todo', tone: 'low', text: 'In progress' };
  return { key: 'todo', tone: 'pending', text: 'Not started' };
};

const TABS = [
  { key: 'all', label: 'All packets' },
  { key: 'todo', label: 'To enter' },
  { key: 'done', label: 'Completed' },
];

export default function ExternalMarkEntry() {
  const [packets, setPackets] = useState([]);
  const [selected, setSelected] = useState(''); // "rebundleId:packetNo"
  const [packet, setPacket] = useState(null);
  const [marks, setMarks] = useState({}); // barcode -> typed text
  const [dirty, setDirty] = useState(false);
  const [loadingList, setLoadingList] = useState(true);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const inputs = useRef([]);

  // packet list helpers
  const [year, setYear] = useState('');
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('all');

  const notify = (type, text) => {
    setMsg({ type, text });
    setTimeout(() => setMsg(null), 4500);
  };

  const toMarks = (rows) =>
    Object.fromEntries(rows.map((r) => [r.barcode, r.mark === null || r.mark === undefined ? '' : String(r.mark)]));

  // ---- packet list ----
  useEffect(() => {
    fetchPackets()
      .then((list) => {
        setPackets(list);
        if (!list.length) return;
        // start with the latest exam year, on the first packet that still needs marks
        const latest = [...new Set(list.map((p) => p.examYear))].sort((a, b) => yearOrder(b) - yearOrder(a))[0];
        const ofYear = list.filter((p) => p.examYear === latest);
        setYear(latest || '');
        setSelected(keyOf(ofYear.find((p) => stateOf(p).key === 'todo') || ofYear[0] || list[0]));
      })
      .catch((e) => notify('error', e.message))
      .finally(() => setLoadingList(false));
  }, []);

  // ---- barcodes + marks of the chosen packet ----
  useEffect(() => {
    if (!selected) return undefined;
    const [rebundleId, packetNo] = selected.split(':');
    let alive = true;
    setLoading(true);
    fetchPacket(rebundleId, packetNo)
      .then((data) => {
        if (!alive) return;
        setPacket(data);
        setMarks(toMarks(data.rows));
        setDirty(false);
      })
      .catch((e) => {
        if (!alive) return;
        setPacket(null);
        setMarks({});
        notify('error', e.message);
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [selected]);

  // warn before closing the tab with unsaved marks
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const rows = packet?.rows || [];
  const min = packet?.min ?? 0;
  const max = packet?.max ?? 0;

  const summary = useMemo(() => {
    let entered = 0;
    let low = 0;
    let bad = 0;
    rows.forEach((r) => {
      const { tone } = checkOf(marks[r.barcode], min, max);
      if (tone === 'ok' || tone === 'low') entered += 1;
      if (tone === 'low') low += 1;
      if (tone === 'bad') bad += 1;
    });
    return { entered, low, bad };
  }, [rows, marks, min, max]);

  /* ---------- the packet list ---------- */
  const years = useMemo(
    () => [...new Set(packets.map((p) => p.examYear).filter(Boolean))].sort((a, b) => yearOrder(b) - yearOrder(a)),
    [packets]
  );

  const list = useMemo(
    () =>
      packets
        .filter((p) => !year || p.examYear === year)
        .map((p) => {
          // the practical paper of a subject code is named in the label the server sends
          const practical = /\(practical\)/i.test(p.label || '');
          const paper = `${p.paperCode || 'Paper'}${practical ? ' (Practical)' : ''}`;
          const details = [p.subjectName, p.batch && `Batch ${p.batch}`].filter(Boolean).join(' · ');
          return {
            ...p,
            key: keyOf(p),
            paper,
            details,
            state: stateOf(p),
            text: `${paper} ${details} packet ${p.packetNo} ${p.label || ''}`.toLowerCase(),
          };
        }),
    [packets, year]
  );

  const counts = {
    all: list.length,
    todo: list.filter((p) => p.state.key === 'todo').length,
    done: list.filter((p) => p.state.key === 'done').length,
  };
  const q = search.trim().toLowerCase();
  const shown = list.filter((p) => (tab === 'all' || p.state.key === tab) && (!q || p.text.includes(q)));
  const current = packets.find((p) => keyOf(p) === selected) || null;
  const currentPractical = /\(practical\)/i.test(current?.label || '');

  // ---- actions ----
  const handlePacketChange = (value) => {
    if (value === selected) return;
    if (dirty && !window.confirm('Marks in this packet are not saved. Leave without saving?')) return;
    setSelected(value);
  };

  const handleMark = (barcode, value) => {
    setMarks((m) => ({ ...m, [barcode]: value }));
    setDirty(true);
  };

  // Enter / arrow keys move between the mark boxes for fast entry
  const handleKey = (e, i) => {
    if (e.key === 'Enter' || e.key === 'ArrowDown') {
      e.preventDefault();
      inputs.current[i + 1]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      inputs.current[i - 1]?.focus();
    }
  };

  const handleSave = async () => {
    if (!packet) return;
    if (summary.bad) {
      const first = rows.findIndex((r) => checkOf(marks[r.barcode], min, max).tone === 'bad');
      inputs.current[first]?.focus();
      return notify('error', `Marks must be between 0 and ${fmt(max)}. Correct the highlighted rows.`);
    }

    setSaving(true);
    try {
      const payload = rows.map((r) => ({
        barcode: r.barcode,
        mark: marks[r.barcode] === '' ? null : Number(marks[r.barcode]),
      }));
      const res = await savePacketMarks(packet.rebundleId, packet.packetNo, payload);
      setMarks(toMarks(res.rows));
      setDirty(false);
      setPackets((all) =>
        all.map((p) => (keyOf(p) === selected ? { ...p, entered: res.entered } : p))
      );
      notify('success', `Packet saved. ${res.entered} of ${res.scripts} marks entered.`);
    } catch (e) {
      notify('error', e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="eme-page">
      <style>{STYLES}</style>

      <div className="eme-head">
        <div>
          <h2>External mark entry</h2>
          <p>
            Enter end-semester marks against barcodes only. Register numbers stay hidden until
            results are processed.
          </p>
        </div>
      </div>

      {msg && <div className={`eme-msg ${msg.type}`}>{msg.text}</div>}

      {/* ---------- 1. choose the packet ---------- */}
      <div className="eme-card">
        <div className="emx-tools">
          <label className="eme-field">
            <span>Year of exam</span>
            <select value={year} onChange={(e) => setYear(e.target.value)} disabled={!years.length}>
              {!years.length && <option value="">—</option>}
              {years.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </label>
          <label className="eme-field emx-search">
            <span>Find a packet</span>
            <input
              type="search"
              placeholder="Subject code, name or batch"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <div className="emx-tabs" role="tablist" aria-label="Show packets">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={tab === t.key}
                className={`emx-tab ${tab === t.key ? 'on' : ''}`}
                onClick={() => setTab(t.key)}
              >
                {t.label}<b>{counts[t.key]}</b>
              </button>
            ))}
          </div>
        </div>

        <div className="emx-list">
          <table>
            <thead>
              <tr>
                <th>Paper</th>
                <th>Packet</th>
                <th className="num">Marks entered</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 && (
                <tr>
                  <td colSpan={4} className="eme-empty">
                    {loadingList
                      ? 'Loading…'
                      : !packets.length
                        ? 'No packets yet. Re-bundle a mapped paper to create packets.'
                        : 'No packet matches. Clear the search or choose "All packets".'}
                  </td>
                </tr>
              )}
              {shown.map((p) => {
                const scripts = Number(p.scripts) || 0;
                const entered = Number(p.entered) || 0;
                return (
                  <tr
                    key={p.key}
                    className={`emx-row ${p.key === selected ? 'on' : ''}`}
                    onClick={() => handlePacketChange(p.key)}
                  >
                    <td>
                      <button type="button" className="emx-pick" aria-pressed={p.key === selected}>
                        {p.paper}
                        {p.details && <span className="emx-sub">{p.details}</span>}
                      </button>
                    </td>
                    <td><b>Packet {p.packetNo}</b></td>
                    <td className="num">
                      <span className="emx-bar" aria-hidden="true">
                        <span style={{ width: `${scripts ? Math.min(100, (entered / scripts) * 100) : 0}%` }} />
                      </span>
                      {entered} / {scripts}
                    </td>
                    <td><span className={`eme-pill ${p.state.tone}`}>{p.state.text}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ---------- 2. marks of the chosen packet ---------- */}
      <div className="eme-card">
        <div className="emx-title">
          <div>
            <h3>
              {current
                ? `${current.paperCode || 'Paper'}${currentPractical ? ' (Practical)' : ''} · Packet ${current.packetNo}`
                : 'Choose a packet above'}
            </h3>
            <p>
              {current
                ? [current.subjectName, current.batch && `Batch ${current.batch}`, current.examYear].filter(Boolean).join(' · ')
                : 'Click a packet in the list to enter its marks.'}
            </p>
          </div>
          <button
            className="eme-btn"
            onClick={handleSave}
            disabled={saving || loading || !rows.length}
          >
            {saving ? 'Saving…' : 'Save packet'}
          </button>
        </div>

        <div className="eme-filters">
          <label className="eme-field eme-field-limits">
            <span>Pass min / max</span>
            <input type="text" readOnly value={packet ? `${fmt(min)} / ${fmt(max)}` : ''} />
          </label>

          {packet && (
            <div className="eme-summary">
              <span><b>{summary.entered}</b> of {rows.length} entered</span>
              {summary.low > 0 && <span className="low"><b>{summary.low}</b> below minimum</span>}
              {dirty && <span className="unsaved">Not saved</span>}
            </div>
          )}
        </div>

        <div className="eme-scroll">
          <table className="eme-table">
            <thead>
              <tr>
                <th className="sno">S.No</th>
                <th>Barcode number</th>
                <th className="num">Mark awarded (max {fmt(max)})</th>
                <th>Check</th>
              </tr>
            </thead>
            <tbody>
              {loading || loadingList ? (
                <tr><td colSpan={4} className="eme-empty">Loading…</td></tr>
              ) : !packets.length ? (
                <tr>
                  <td colSpan={4} className="eme-empty">
                    No packets yet. Re-bundle a mapped paper to create packets.
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="eme-empty">
                    {current ? 'This packet has no scripts.' : 'Choose a packet in the list above.'}
                  </td>
                </tr>
              ) : (
                rows.map((r, i) => {
                  const check = checkOf(marks[r.barcode], min, max);
                  return (
                    <tr key={r.barcode}>
                      <td className="sno">{r.sno}</td>
                      <td><b>{r.barcode}</b></td>
                      <td className="num">
                        <input
                          ref={(el) => { inputs.current[i] = el; }}
                          className={`eme-mark ${check.tone === 'bad' ? 'bad' : ''}`}
                          type="number"
                          inputMode="decimal"
                          min="0"
                          max={max}
                          step="0.5"
                          value={marks[r.barcode] ?? ''}
                          onChange={(e) => handleMark(r.barcode, e.target.value)}
                          onKeyDown={(e) => handleKey(e, i)}
                          onWheel={(e) => e.currentTarget.blur()} // scrolling must not change a mark
                          aria-label={`Mark for barcode ${r.barcode}`}
                        />
                      </td>
                      <td><span className={`eme-pill ${check.tone}`}>{check.text}</span></td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
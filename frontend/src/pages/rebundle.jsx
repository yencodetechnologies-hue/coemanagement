import { useCallback, useEffect, useMemo, useState } from 'react';
import { errMsg } from '../config/Barcode';
import { assignEvaluator, getRebundle, listEvaluators, listPapers, runRebundle } from '../config/Rebundle';

const statusClass = (s) => (s === 'Completed' ? 'done' : s === 'In progress' ? 'progress' : 'pending');

/* ---------- styles of the paper list (kept in this file, so only one file has to be replaced) ----------
   Colours come from the dashboard variables. The .eb-page prefix is needed because dashboard.css
   resets font and colour on every button, input and select. */
const STYLES = `
.eb-page .rb-tools { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 12px 14px; padding: 15px 20px 13px; border-bottom: 1px solid var(--line); background: color-mix(in srgb, var(--bg) 60%, var(--card)); }
.eb-page .rb-search { flex: 1 1 240px; max-width: 340px; }
.eb-page .rb-search input { width: 100%; }
.eb-page .rb-tabs { display: inline-flex; margin-left: auto; border: 1px solid var(--line); border-radius: 8px; overflow: hidden; background: var(--card); }
.eb-page .rb-tab { height: 36px; padding: 0 14px; border: 0; border-right: 1px solid var(--line); background: transparent; font-size: 13px; font-weight: 600; color: var(--muted); cursor: pointer; }
.eb-page .rb-tab:last-child { border-right: 0; }
.eb-page .rb-tab b { margin-left: 6px; font-weight: 700; }
.eb-page .rb-tab.on { background: var(--navy); color: #fff; }
.dashboard-container[data-theme='dark'] .eb-page .rb-tab.on { background: var(--gold); color: #101d5c; }
.eb-page .rb-list { max-height: 318px; overflow-y: auto; }
.eb-page .rb-list table { width: 100%; border-collapse: collapse; text-align: left; font-size: 14px; }
.eb-page .rb-list th { position: sticky; top: 0; z-index: 1; padding: 10px 20px; font-size: 12px; font-weight: 600; color: var(--muted); background: color-mix(in srgb, var(--bg) 60%, var(--card)); border-bottom: 1px solid var(--line); white-space: nowrap; }
.eb-page .rb-list td { padding: 10px 20px; border-bottom: 1px solid var(--line); vertical-align: middle; }
.eb-page .rb-list tr:last-child td { border-bottom: 0; }
.eb-page .rb-list .num { text-align: right; white-space: nowrap; }
.eb-page .rb-row { cursor: pointer; }
.eb-page .rb-row:hover td { background: color-mix(in srgb, var(--accent) 5%, transparent); }
.eb-page .rb-row.on td { background: color-mix(in srgb, var(--accent) 10%, transparent); }
.eb-page .rb-row.on td:first-child { box-shadow: inset 3px 0 0 var(--navy); }
.dashboard-container[data-theme='dark'] .eb-page .rb-row.on td:first-child { box-shadow: inset 3px 0 0 var(--gold); }
.eb-page .rb-pick { display: block; width: 100%; padding: 0; border: 0; background: none; text-align: left; font-size: 14px; font-weight: 700; color: var(--text); cursor: pointer; }
.eb-page .rb-sub { display: block; margin-top: 2px; font-size: 12px; font-weight: 400; color: var(--muted); }
.eb-page .rb-title { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px 16px; padding: 14px 20px; border-bottom: 1px solid var(--line); }
.eb-page .rb-title h3 { margin: 0; font-family: var(--serif); font-size: 16px; font-weight: 600; }
.eb-page .rb-title p { margin: 2px 0 0; font-size: 12px; color: var(--muted); }
.eb-page .rb-run { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 10px; }
.eb-page .rb-run .eb-field input { width: 110px; }
.eb-page .rb-note { padding: 10px 20px; font-size: 13px; border-bottom: 1px solid var(--line); background: color-mix(in srgb, var(--accent) 6%, transparent); color: var(--text); }
.eb-page .rb-note.warn { background: var(--eb-amber-bg, #fff0d9); color: var(--eb-amber-text, #7a4600); }
@media (max-width: 768px) { .eb-page .rb-tabs { margin-left: 0; width: 100%; } .eb-page .rb-tab { flex: 1; padding: 0 8px; } }
`;

// what the list needs to know about one paper, taken from its packets (getRebundle)
const metaOf = (d) => {
  const m = d?.mapping || {};
  const packets = d?.packets || [];
  const scripts = packets.reduce((n, p) => n + (Number(p.scripts) || 0), 0);
  return {
    subjectName: m.subjectName || '',
    batch: m.batch || '',
    semester: m.semester || '',
    type: m.subjectType || '',
    bundled: Boolean(d?.bundled) || packets.length > 0,
    packets: packets.length,
    scripts: scripts || null,
    marks: packets.reduce((n, p) => n + (Number(p.marksEntered) || 0), 0),
    unassigned: packets.filter((p) => !p.evaluatorId).length,
  };
};

const TABS = [
  { key: 'all', label: 'All papers' },
  { key: 'todo', label: 'To bundle' },
  { key: 'done', label: 'Packets created' },
];

export default function Rebundle() {
  const [years, setYears] = useState([]);
  const [year, setYear] = useState('');
  const [papers, setPapers] = useState([]);
  const [paperId, setPaperId] = useState('');
  const [size, setSize] = useState(10);
  const [detail, setDetail] = useState(null);
  const [evaluators, setEvaluators] = useState([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  // paper list helpers
  const [meta, setMeta] = useState({}); // paper id -> metaOf(...)
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('all');
  const [loadingPapers, setLoadingPapers] = useState(true);

  // exam years + mapped papers of the selected year
  const loadPapers = useCallback(async () => {
    const r = await listPapers(year);
    setYears(r.examYears || []);
    if (!year && r.examYear) setYear(r.examYear);
    setPapers(r.papers || []);
    setPaperId((cur) => ((r.papers || []).some((p) => p.id === cur) ? cur : r.papers?.[0]?.id || ''));
    return r.papers || [];
  }, [year]);

  useEffect(() => {
    let alive = true;
    setLoadingPapers(true);
    loadPapers()
      .catch((e) => alive && setMsg({ ok: false, text: errMsg(e) }))
      .finally(() => alive && setLoadingPapers(false));
    return () => {
      alive = false;
    };
  }, [loadPapers]);

  // Packets, scripts and marks of every paper, for the list (a few requests at a time).
  // The list is usable straight away; these figures fill in as they arrive.
  useEffect(() => {
    let alive = true;
    const todo = papers.map((p) => p.id);
    const worker = async () => {
      while (alive && todo.length) {
        const id = todo.shift();
        try {
          const d = await getRebundle(id);
          if (alive) setMeta((m) => ({ ...m, [id]: metaOf(d) }));
        } catch {
          /* the row simply keeps its dashes */
        }
      }
    };
    Promise.all([worker(), worker(), worker(), worker()]);
    return () => {
      alive = false;
    };
  }, [papers]);

  useEffect(() => {
    listEvaluators()
      .then((l) => setEvaluators(l || []))
      .catch(() => {});
  }, []);

  const loadDetail = useCallback(async () => {
    if (!paperId) {
      setDetail(null);
      return;
    }
    try {
      const d = await getRebundle(paperId);
      setDetail(d);
      setMeta((m) => ({ ...m, [paperId]: metaOf(d) }));
      if (d.packetSize) setSize(d.packetSize);
    } catch (e) {
      setDetail(null);
      setMsg({ ok: false, text: errMsg(e) });
    }
  }, [paperId]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  const m = detail?.mapping;
  const info = m?.info || {};
  const packets = detail?.packets || [];
  const marksEntered = packets.reduce((n, p) => n + (Number(p.marksEntered) || 0), 0);
  const hasPackets = Boolean(detail?.bundled) || packets.length > 0;
  const range = (p) => p.barcodes.slice(0, 4).join(', ') + (p.barcodes.length > 4 ? '…' : '');

  const onRebundle = async () => {
    if (hasPackets) {
      const marks = marksEntered
        ? `\n\n${marksEntered} mark(s) are already entered in these packets. They may not be kept.`
        : '';
      if (
        !window.confirm(
          `This paper already has ${packets.length} packet(s).\nRe-bundle will replace them and clear all evaluator assignments.${marks}\n\nContinue?`
        )
      )
        return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const r = await runRebundle(paperId, Number(size));
      await loadDetail(); // also refreshes this paper's line in the list
      setMsg({ ok: true, text: `${r.packets} packet(s) created.` });
    } catch (e) {
      setMsg({ ok: false, text: errMsg(e) });
    } finally {
      setBusy(false);
    }
  };

  const onAssign = async (packetNo, evaluatorId) => {
    setMsg(null);
    try {
      await assignEvaluator(paperId, packetNo, evaluatorId);
      setDetail((d) => ({
        ...d,
        packets: d.packets.map((p) =>
          p.packetNo === packetNo
            ? {
                ...p,
                evaluatorId: evaluatorId || null,
                evaluatorName: evaluators.find((x) => x._id === evaluatorId)?.name || '',
              }
            : p
        ),
      }));
    } catch (e) {
      setMsg({ ok: false, text: errMsg(e) });
    }
  };

  /* ---------- the paper list ---------- */
  // one line per paper: what the server sent, completed with what is known from its packets
  const list = useMemo(
    () =>
      papers.map((p) => {
        const x = meta[p.id] || {};
        const bundled = x.bundled ?? Boolean(p.bundled);
        const title = String(p.label || p.paperCode || 'Paper').replace(/[\s\u2713(\-\u2013\u00b7]*re-?bundled?\)?\s*$/i, '').trim();
        const details = [
          p.variant,
          x.subjectName || p.subjectName,
          (x.batch || p.batch) && `Batch ${x.batch || p.batch}`,
          (x.semester || p.semester) && `Semester ${String(x.semester || p.semester).replace(/^semester\s*/i, '')}`,
        ].filter(Boolean);
        return {
          id: p.id,
          title,
          // the extra line is shown only when it adds something the title does not already say
          details: details.filter((d) => !title.toLowerCase().includes(String(d).toLowerCase())).join(' · '),
          bundled,
          packets: x.packets ?? null,
          scripts: x.scripts ?? p.scripts ?? null,
          marks: x.marks ?? null,
          unassigned: x.unassigned ?? null,
          text: `${title} ${details.join(' ')}`.toLowerCase(),
        };
      }),
    [papers, meta]
  );

  const counts = {
    all: list.length,
    todo: list.filter((p) => !p.bundled).length,
    done: list.filter((p) => p.bundled).length,
  };
  const q = search.trim().toLowerCase();
  const shown = list.filter(
    (p) => (tab === 'all' || (tab === 'todo' ? !p.bundled : p.bundled)) && (!q || p.text.includes(q))
  );
  const selected = list.find((p) => p.id === paperId) || null;

  const stateOf = (p) => {
    if (!p.bundled) return { cls: 'pending', text: 'Not bundled yet' };
    if (p.scripts && p.marks !== null && p.marks >= p.scripts) return { cls: 'done', text: 'Marks completed' };
    if (p.marks) return { cls: 'progress', text: 'Marks in progress' };
    return { cls: 'done', text: 'Packets created' };
  };

  return (
    <div className="eb-page">
      <style>{STYLES}</style>

      <div className="eb-head">
        <div>
          <h1>Re-bundle</h1>
          <p>
            Shuffle barcoded scripts into sealed packets and assign each packet to an evaluator. Scripts from one
            register-number block are spread across packets.
          </p>
        </div>
      </div>

      {msg && <p className={`eb-alert ${msg.ok ? 'ok' : 'error'}`}>{msg.text}</p>}

      {/* ---------- 1. choose the paper ---------- */}
      <section className="eb-card">
        <div className="rb-tools">
          <label className="eb-field">
            <span>Year of exam</span>
            <select value={year} onChange={(e) => setYear(e.target.value)}>
              {years.map((y) => (
                <option key={y}>{y}</option>
              ))}
            </select>
          </label>
          <label className="eb-field rb-search">
            <span>Find a paper</span>
            <input
              type="search"
              placeholder="Subject code, name or batch"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <div className="rb-tabs" role="tablist" aria-label="Show papers">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={tab === t.key}
                className={`rb-tab ${tab === t.key ? 'on' : ''}`}
                onClick={() => setTab(t.key)}
              >
                {t.label}<b>{counts[t.key]}</b>
              </button>
            ))}
          </div>
        </div>

        <div className="rb-list">
          <table>
            <thead>
              <tr>
                <th>Mapped paper</th>
                <th className="num">Scripts</th>
                <th className="num">Packets</th>
                <th className="num">Marks entered</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 && (
                <tr>
                  <td colSpan={5} className="eb-empty">
                    {loadingPapers
                      ? 'Loading…'
                      : papers.length === 0
                        ? 'No mapped papers for this exam year. Map a paper first (Bar code mapping).'
                        : 'No paper matches. Clear the search or choose "All papers".'}
                  </td>
                </tr>
              )}
              {shown.map((p) => {
                const st = stateOf(p);
                return (
                  <tr
                    key={p.id}
                    className={`rb-row ${p.id === paperId ? 'on' : ''}`}
                    onClick={() => setPaperId(p.id)}
                  >
                    <td>
                      <button type="button" className="rb-pick" aria-pressed={p.id === paperId}>
                        {p.title}
                        {p.details && <span className="rb-sub">{p.details}</span>}
                      </button>
                    </td>
                    <td className="num">{p.scripts ?? '—'}</td>
                    <td className="num">{p.bundled ? p.packets ?? '—' : '—'}</td>
                    <td className="num">
                      {p.bundled && p.marks !== null ? `${p.marks}${p.scripts ? ` / ${p.scripts}` : ''}` : '—'}
                    </td>
                    <td><span className={`eb-pill ${st.cls}`}>{st.text}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* ---------- 2. packets of the chosen paper ---------- */}
      <section className="eb-card">
        <div className="rb-title">
          <div>
            <h3>{selected ? selected.title : 'Choose a paper above'}</h3>
            <p>
              {!selected
                ? 'Click a paper in the list to see or create its packets.'
                : hasPackets
                  ? `${packets.length} packet(s) already created · ${marksEntered} mark(s) entered`
                  : 'No packets yet for this paper.'}
            </p>
          </div>
          <div className="rb-run">
            <label className="eb-field">
              <span>Scripts per packet</span>
              <input type="number" min="1" max="500" value={size} onChange={(e) => setSize(e.target.value)} />
            </label>
            <button
              type="button"
              className={`eb-btn ${hasPackets ? 'outline' : 'primary'}`}
              onClick={onRebundle}
              disabled={busy || !paperId}
            >
              {busy ? 'Working…' : hasPackets ? 'Re-bundle again' : 'Create packets'}
            </button>
          </div>
        </div>

        {selected && hasPackets && (
          <p className={`rb-note ${marksEntered ? 'warn' : ''}`} style={{ margin: 0 }}>
            {marksEntered
              ? `Packets are created and ${marksEntered} mark(s) are entered. Re-bundle again only if the packets must be redone: it replaces them and clears the evaluator assignments.`
              : 'Packets are already created for this paper. Assign an evaluator to each packet below. “Re-bundle again” replaces these packets.'}
          </p>
        )}

        {m && (
          <div className="eb-info">
            <span>Inst name <b>{info.instName}</b></span>
            <span>Degree <b>{info.degree}</b></span>
            <span>Course mode <b>{info.courseMode}</b></span>
            <span>Department <b>{info.department}</b></span>
            <span>Regulation <b>{info.regulation}</b></span>
            <span>Exam pattern <b>{info.examPattern}</b></span>
            <span>Subject name <b>{m.subjectName}</b></span>
            <span>Batch <b>{m.batch}</b></span>
            <span>Mapping status <b>{m.status}</b></span>
          </div>
        )}

        <div className="eb-table-wrap">
          <table className="eb-table">
            <thead>
              <tr>
                <th>Packet</th>
                <th className="num">Scripts</th>
                <th>Barcode range</th>
                <th>Evaluator</th>
                <th className="num">Marks entered</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {packets.length === 0 && (
                <tr>
                  <td colSpan={6} className="eb-empty">
                    {paperId
                      ? 'No packets yet. Set the scripts per packet and click “Create packets”.'
                      : 'Map a paper first (Bar code mapping).'}
                  </td>
                </tr>
              )}
              {packets.map((p) => (
                <tr key={p.packetNo}>
                  <td><b>Packet {p.packetNo}</b></td>
                  <td className="num">{p.scripts}</td>
                  <td className="muted">{range(p)}</td>
                  <td>
                    <select
                      className="eb-eval"
                      value={p.evaluatorId || ''}
                      onChange={(e) => onAssign(p.packetNo, e.target.value)}
                    >
                      <option value="">Not assigned</option>
                      {evaluators.map((ev) => (
                        <option key={ev._id} value={ev._id}>
                          {ev.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="num">{p.marksEntered} / {p.scripts}</td>
                  <td><span className={`eb-pill ${statusClass(p.status)}`}>{p.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
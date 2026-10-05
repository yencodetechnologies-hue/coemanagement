import  { useEffect } from 'react';
import { X } from 'lucide-react';

/* ---------- Letterhead: edit these to match your university ---------- */
const LETTERHEAD = {
  logoText: 'BIHER',
  logoUrl: '', // optional: put your logo image URL here to replace the circle text
  university: 'BHARATH INSTITUTE OF HIGHER EDUCATION AND RESEARCH',
  declared: '(Declared as Deemed-to-be University under Section 3 of UGC Act 1956)',
  address: '# 173, Agharam Road, Selaiyur, Chennai - 600 073, Tamil Nadu, India'
};
const ATTENDANCE_HEADING = 'Attendance 75%';
const NAVY = '#1f2a6d';

const SHEET_CSS = `
.bs-sheet{font-family:'Source Serif 4',Georgia,'Times New Roman',serif;color:#111;background:#fff;box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.bs-sheet *{box-sizing:border-box}
.bs-head{position:relative;text-align:center}
.bs-logo{position:absolute;left:0;top:28px;width:58px;height:58px;border:2px solid ${NAVY};border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px;color:${NAVY};overflow:hidden}
.bs-logo img{width:100%;height:100%;object-fit:contain}
.bs-univ{font-size:15px;font-weight:700;color:${NAVY};letter-spacing:.4px;line-height:1.35;margin:0 76px}
.bs-decl,.bs-addr{font-size:10.5px;color:${NAVY};margin-top:3px}
.bs-inst{font-size:10.5px;font-weight:700;color:${NAVY};margin-top:4px}
.bs-title{margin-top:14px;font-size:14px;font-weight:700;letter-spacing:1px;color:${NAVY}}
.bs-addon{margin-top:4px;font-size:12px;color:#333}
.bs-rule{border:0;border-top:2px solid ${NAVY};margin:8px 0 14px}
.bs-info{border:1px solid #222;padding:8px 10px;display:grid;grid-template-columns:1.05fr 1fr;column-gap:12px;row-gap:5px;font-size:12px;line-height:1.45}
.bs-info .lbl{display:inline-block;width:130px;color:#555;font-weight:400}
.bs-info b{font-weight:700}
.bs-table{width:100%;border-collapse:collapse;margin-top:8px;font-size:11px;table-layout:fixed}
.bs-table th,.bs-table td{border:1px solid #222;padding:5px 8px;text-align:left}
.bs-table th{background:#e8ecf7;color:${NAVY};text-align:center;font-weight:700}
.bs-table td.c{text-align:center}
.bs-sign{display:flex;justify-content:space-between;margin-top:46px;font-size:11px}
.bs-sign div{width:170px;border-top:1px solid #222;padding-top:6px;text-align:center}
`;

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------- Sheet markup (used for both the preview and the printout) ---------- */
export function buildSheetHtml({ f, instName, department, semesterRoman, subject, titleAddon, rows }) {
  const internal = f.subjectType === 'Internal';
  const title = internal
    ? `ATTENDANCE AND INTERNAL ASSESSMENT - ${f.examYear}`
    : `ATTENDANCE SHEET - ${String(f.subjectType).toUpperCase()} - ${f.examYear}`;

  const courseText = `${f.course}${department ? ` - ${department}` : ''} (${semesterRoman} SEMESTER)`;
  const subjectText = `${f.subCode} - ${String(subject?.subNameP1 || '').toUpperCase()}`;
  const minMax = subject ? `${subject.minMark} / ${subject.maxMark}` : '—';
  const lastHeading = internal ? 'Mark' : 'Present';

  const body = rows
    .map((r, i) => {
      const last = internal ? (r.internalMark ?? '') : r.present ? 'Present' : 'Absent';
      return `<tr>
        <td class="c">${i + 1}</td>
        <td>${esc(r.regNo)}</td>
        <td>${esc(r.studentName)}</td>
        <td class="c">${esc(r.attendance ?? '')}</td>
        <td class="c">${esc(last)}</td>
      </tr>`;
    })
    .join('');

  const logo = LETTERHEAD.logoUrl
    ? `<img src="${esc(LETTERHEAD.logoUrl)}" alt="logo" />`
    : esc(LETTERHEAD.logoText);

  return `<div class="bs-sheet">
    <div class="bs-head">
      <div class="bs-logo">${logo}</div>
      <div class="bs-univ">${esc(LETTERHEAD.university)}</div>
      <div class="bs-decl">${esc(LETTERHEAD.declared)}</div>
      <div class="bs-addr">${esc(LETTERHEAD.address)}</div>
      <div class="bs-inst">${esc(instName)}</div>
      <div class="bs-title">${esc(title)}</div>
      ${titleAddon ? `<div class="bs-addon">${esc(titleAddon)}</div>` : ''}
    </div>
    <hr class="bs-rule" />
    <div class="bs-info">
      <div><span class="lbl">Course</span><b>${esc(courseText)}</b></div>
      <div><span class="lbl">Min / Max</span><b>${esc(minMax)}</b></div>
      <div><span class="lbl">Subject</span><b>${esc(subjectText)}</b></div>
      <div><span class="lbl">Total candidates</span><b>${rows.length}</b></div>
    </div>
    <table class="bs-table">
      <colgroup><col style="width:8%"/><col style="width:20%"/><col style="width:35%"/><col style="width:26%"/><col style="width:11%"/></colgroup>
      <thead>
        <tr>
          <th>S.No</th><th>Register no</th><th>Name of the candidate</th><th>${esc(ATTENDANCE_HEADING)}</th><th>${lastHeading}</th>
        </tr>
      </thead>
      <tbody>${body}</tbody>
    </table>
    <div class="bs-sign"><div>Subject in-charge</div><div>Dean / Principal</div></div>
  </div>`;
}

/* ---------- Print through a hidden iframe (no pop-up blockers) ---------- */
function printHtml(html) {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow.document;
  doc.open();
  doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>Attendance and internal assessment</title>
<style>@page{size:A4;margin:14mm}body{margin:0}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}${SHEET_CSS}</style>
</head><body>${html}</body></html>`);
  doc.close();

  setTimeout(() => {
    iframe.contentWindow.focus();
    iframe.contentWindow.print();
    setTimeout(() => { if (iframe.parentNode) iframe.parentNode.removeChild(iframe); }, 1500);
  }, 250);
}

/* ---------- Modal ---------- */
export default function AttendancePrintModal({ onClose, f, instName, department, semesterRoman, subject, titleAddon, rows }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const html = buildSheetHtml({ f, instName, department, semesterRoman, subject, titleAddon, rows });

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ width: 'min(1000px, 96vw)', maxHeight: 'calc(100vh - 32px)' }} role="dialog" aria-modal="true">
        <div className="modal-head">
          <h2>Attendance and internal assessment</h2>
          <button type="button" className="icon-only" aria-label="Close" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="modal-body" style={{ overflowY: 'auto', background: '#e7eaf3', padding: '18px' }}>
          <style>{SHEET_CSS}</style>
          <div
            style={{ background: '#fff', width: 780, maxWidth: '100%', margin: '0 auto', padding: 38, boxShadow: '0 2px 10px rgba(20,30,80,.12)' }}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </div>

        <div className="modal-foot">
          <button type="button" className="btn" onClick={onClose}>Close</button>
          <button type="button" className="btn btn-primary" onClick={() => printHtml(html)}>Print</button>
        </div>
      </div>
    </div>
  );
}
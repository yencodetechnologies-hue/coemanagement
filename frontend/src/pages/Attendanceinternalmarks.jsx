import React, { useEffect, useMemo, useRef, useState } from 'react';
import { institutionsApi } from '../config/Institutionsapi';
import { coursesApi } from '../config/Coursesapi';
import { curriculumApi } from '../config/CurriculumMasterapi';
import { attendanceMarksApi } from '../config/Attendancemarksapi';
import AttendancePrintModal from './Attendanceprintmodal';

// dd-mm-yyyy
const formatDay = (d) => {
  const t = new Date(d);
  if (Number.isNaN(t.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${p(t.getDate())}-${p(t.getMonth() + 1)}-${t.getFullYear()}`;
};

/* ---------- constants & helpers ---------- */
const SUBJECT_TYPES = ['Theory', 'Practical', 'Internal'];
const STUDENT_CATEGORIES = ['REGULAR', 'PART TIME', 'LATERAL ENTRY']; // matches Student.mode
const DEFAULT_TERMS = 8;

function examYearOptions() {
  const y = new Date().getFullYear();
  const out = [];
  for (let yr = y - 1; yr <= y + 1; yr++) out.push(`MAR-${yr}`, `SEP-${yr}`);
  return out;
}

function defaultExamYear() {
  const d = new Date();
  return `${d.getMonth() < 6 ? 'MAR' : 'SEP'}-${d.getFullYear()}`;
}

// Number of terms configured on the course record (same logic as Curriculum master)
function getTermCount(course) {
  if (!course) return DEFAULT_TERMS;
  const n = Number(
    course.noOfTerms ?? course.numberOfTerms ?? course.totalTerms ?? course.terms ?? course.noOfSemesters ?? course.totalSemesters
  );
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_TERMS;
}

function toRoman(num) {
  let n = Number(num);
  if (!Number.isInteger(n) || n <= 0) return String(num ?? '');
  const map = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let out = '';
  for (const [v, s] of map) {
    while (n >= v) { out += s; n -= v; }
  }
  return out;
}

// Normalises 1 / "1" / "I" / "Semester IV" -> "1" / "1" / "1" / "4"
function parseSemester(v) {
  if (v === undefined || v === null || v === '') return '';
  const s = String(v).trim();
  if (/^\d+$/.test(s)) return String(Number(s));
  const roman = s.replace(/^semester\s*/i, '').toUpperCase();
  if (/^[IVX]+$/.test(roman)) {
    const val = { I: 1, V: 5, X: 10 };
    let total = 0;
    for (let i = 0; i < roman.length; i++) {
      const cur = val[roman[i]];
      const next = val[roman[i + 1]];
      total += next > cur ? -cur : cur;
    }
    return String(total);
  }
  return s;
}

const norm = (v) => String(v ?? '').trim().toLowerCase();

// Reads every page of the curriculum list (the API may cap the page size)
async function fetchAllCurriculum(params) {
  const all = [];
  let page = 1;
  let totalPages = 1;
  do {
    const d = await curriculumApi.list({ ...params, page, limit: 100 });
    all.push(...(d.items || []));
    totalPages = d.totalPages || 1;
    page += 1;
  } while (page <= totalPages && page <= 20);
  return all;
}

/*
 * Subject codes for the selected semester.
 * Strict rules (never hide a subject of the semester):
 *   - semester must match the selected one ("1", "I" and "Semester I" all count),
 *   - course must match when the record carries one,
 *   - Inactive records are skipped.
 *   - University AND College exam subjects are both listed.
 *   - The same sub code with a Theory and a Practical record is listed twice (once per component).
 * Batch / regulation are only used to choose WHICH record to keep when the same
 * sub code exists more than once - they never remove a code from the list.
 */
function pickSubjects(all, { course, semester, batch, courseRegulation }) {
  const list = all.filter(
    (s) =>
      s.subCodeP1 &&
      parseSemester(s.semester) === String(semester) &&
      (!s.course || norm(s.course) === norm(course)) &&
      s.status !== 'Inactive'
  );

  const score = (s) => {
    let n = 0;
    if (s.batch) n += norm(s.batch) === norm(batch) ? 2 : -1;
    if (s.regulation && norm(s.regulation) === norm(courseRegulation)) n += 1;
    return n;
  };

  // one row per sub code + component, so a Theory and a Practical record of the same code both stay
  const byCode = new Map();
  list.forEach((s) => {
    const k = `${s.subCodeP1}::${norm(s.component)}`;
    const prev = byCode.get(k);
    if (!prev || score(s) > score(prev)) byCode.set(k, s);
  });

  return [...byCode.values()].sort(
    (a, b) =>
      String(a.subCodeP1).localeCompare(String(b.subCodeP1), undefined, { numeric: true }) ||
      String(a.component).localeCompare(String(b.component))
  );
}

const toNum = (v) => (v === '' || v === null || v === undefined ? null : Number(v));

// Pass / Fail of the entered mark (min comes from the selected subject and sheet type)
function internalStatus(row, subject) {
  if (row.mark === null || row.mark === undefined) return '—';
  return row.mark >= (subject?.markMin ?? subject?.minMark ?? 0) ? 'Pass' : 'Fail';
}

// Returns an error message if the row has an invalid value, else ''
function rowError(row, subjectType, subject) {
  if (row.attendance !== null && (row.attendance < 0 || row.attendance > 100)) return 'Attendance must be 0–100';
  if (row.mark !== null && row.mark !== undefined) {
    const max = subject?.markMax ?? subject?.maxMark ?? 0;
    if (row.mark < 0 || (max > 0 && row.mark > max)) return `Mark must be 0–${max}`;
  }
  return '';
}

// The mark shown in a sheet row (the Internal sheet keeps it in internalMark)
const withMark = (r, subjectType) => ({
  ...r,
  mark: r.mark !== undefined ? r.mark : subjectType === 'Internal' ? r.internalMark ?? null : null
});

/* ---------- small presentational component (module level so it never remounts) ---------- */
function FilterSelect({ label, value, options, onChange, width = 150, disabled }) {
  return (
    <label className="form-label" style={{ minWidth: width }}>
      <span>{label}</span>
      <select className="field" value={value} onChange={onChange} disabled={disabled}>
        {options.length === 0 && <option value="">—</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}

/* ---------- Main component ---------- */
export default function AttendanceInternalMarks() {
  const [f, setF] = useState({
    instCode: '',
    course: '',
    batch: '',
    semester: '1',
    subCode: '',
    subjectType: 'Theory',
    examYear: defaultExamYear(),
    studentCategory: 'REGULAR'
  });
  const update = (patch) => setF((p) => ({ ...p, ...patch }));

  const [institutions, setInstitutions] = useState([]);
  const [coursesList, setCoursesList] = useState([]);
  const [coursesLoaded, setCoursesLoaded] = useState(false);
  const [batches, setBatches] = useState([]);
  const [batchesKey, setBatchesKey] = useState('');       // inst|course the batches belong to
  const [allSubjects, setAllSubjects] = useState([]);     // raw curriculum records for inst|course (all semesters)
  const [subjectsKey, setSubjectsKey] = useState('');     // inst|course the records belong to
  const [subKey, setSubKey] = useState('');               // the chosen Subject code option (code::component)

  const [sheet, setSheet] = useState(null);
  const [subject, setSubject] = useState(null);
  const [rows, setRows] = useState([]);
  const [notListed, setNotListed] = useState([]);       // students of the batch that are not on this sheet, with the reason
  const [titleAddon, setTitleAddon] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState(null);
  const [saveState, setSaveState] = useState('idle'); // idle | saving | saved | error
  const [lock, setLock] = useState(null);             // { locked, lockedOn, lockedBy } of the batch; null = not loaded yet
  const [working, setWorking] = useState(false);      // true while Verify / Unlock is being saved
  const [showPrint, setShowPrint] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const reqId = useRef(0);
  const rowsRef = useRef([]);
  const queue = useRef({});     // pending autosaves keyed by `${sheetId}:${regNo}`
  const inflight = useRef(0);
  const titleTimer = useRef(null);

  // Locked = the whole batch is verified. It does NOT depend on the semester or subject chosen.
  const locked = lock?.locked === true;
  const internal = f.subjectType === 'Internal';
  // A sheet that was verified on its own earlier is opened up automatically (see below); until
  // that is done its boxes stay closed, because the server would refuse the save.
  const sheetStillLocked = sheet?.status === 'VERIFIED';
  const frozen = locked || working || sheetStillLocked;

  /* ----- derived values ----- */
  const currentInst = institutions.find((i) => i.instCode === f.instCode);
  const filteredCourses = coursesList.filter((c) => c.instCode === f.instCode);
  const activeCourse = filteredCourses.find((c) => c.courseName === f.course) || null;
  const termCount = getTermCount(activeCourse);
  const semesterOptions = Array.from({ length: termCount }, (_, i) => String(i + 1));

  // Valid combination: the course belongs to the institution and the semester is in its term range
  const courseValid = coursesLoaded && Boolean(activeCourse);
  const semesterValid = courseValid && Number(f.semester) <= termCount;
  const batchKey = `${f.instCode}|${f.course}`;

  // Subject dropdown options: the records that apply to this semester / batch / regulation
  const subjects = useMemo(() => {
    if (subjectsKey !== batchKey) return [];
    return pickSubjects(allSubjects, {
      course: f.course,
      semester: f.semester,
      batch: f.batch,
      courseRegulation: activeCourse?.regulation
    });
  }, [allSubjects, subjectsKey, batchKey, f.course, f.semester, f.batch, activeCourse?.regulation]);

  /* ----- load institutions + courses once ----- */
  useEffect(() => {
    institutionsApi.list({ page: 1, limit: 100 })
      .then((res) => {
        const items = res.items || [];
        setInstitutions(items);
        setF((p) => (p.instCode ? p : { ...p, instCode: items[0]?.instCode || '' }));
      })
      .catch((err) => console.error('Failed to load institutions', err));

    coursesApi.list({ page: 1, limit: 100 })
      .then((res) => setCoursesList(res.items || []))
      .catch((err) => console.error('Failed to load courses', err))
      .finally(() => setCoursesLoaded(true));
  }, []);

  /* ----- auto-select first course of the institution ----- */
  useEffect(() => {
    setF((p) => {
      if (filteredCourses.some((c) => c.courseName === p.course)) return p;
      return { ...p, course: filteredCourses[0]?.courseName || '' };
    });
  }, [f.instCode, coursesList]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ----- keep semester inside the course's term range ----- */
  useEffect(() => {
    setF((p) => (Number(p.semester) > termCount ? { ...p, semester: '1' } : p));
  }, [termCount]);

  /* ----- batches for inst + course ----- */
  useEffect(() => {
    if (!f.instCode || !f.course || !courseValid) {
      setBatches([]); setBatchesKey('');
      return undefined;
    }
    let cancelled = false;
    const key = `${f.instCode}|${f.course}`;
    attendanceMarksApi.batches({ instCode: f.instCode, course: f.course })
      .then((res) => {
        if (cancelled) return;
        const items = res.items || [];
        setBatches(items);
        setBatchesKey(key);
        setF((p) => (items.includes(p.batch) ? p : { ...p, batch: items[0] || '' }));
      })
      .catch((e) => { if (!cancelled) setMsg({ type: 'error', text: e.message }); });
    return () => { cancelled = true; };
  }, [f.instCode, f.course, courseValid]);

  /* ----- curriculum records for inst + course (ALL semesters) -----
     The semester is filtered here in the browser, so records saved as "3", "III" or
     "Semester III" are all found no matter how the API compares the semester string. */
  useEffect(() => {
    if (!f.instCode || !f.course || !courseValid) {
      setAllSubjects([]); setSubjectsKey('');
      return undefined;
    }
    let cancelled = false;
    const key = `${f.instCode}|${f.course}`;
    fetchAllCurriculum({ instCode: f.instCode, course: f.course })
      .then((items) => {
        if (cancelled) return;
        setAllSubjects(items);
        setSubjectsKey(key);
      })
      .catch((e) => {
        if (cancelled) return;
        setAllSubjects([]); setSubjectsKey('');
        setMsg({ type: 'error', text: e.message });
      });
    return () => { cancelled = true; };
  }, [f.instCode, f.course, courseValid]);

  /* ----- load the sheet (students + saved values) ----- */
  // Requested only when batch + subject belong to the CURRENT inst/course/semester,
  // so a stale subject code from the previous selection is never sent
  const ready = Boolean(
    f.instCode && f.course && f.batch && f.semester && f.subCode && f.subjectType && f.examYear && f.studentCategory &&
    semesterValid &&
    subjectsKey === batchKey &&
    batchesKey === batchKey &&
    batches.includes(f.batch) &&
    subjects.some((s) => s.subCodeP1 === f.subCode)
  );

  useEffect(() => {
    if (!ready) {
      setSheet(null); setSubject(null); setRows([]); setNotListed([]); rowsRef.current = [];
      return;
    }
    const id = ++reqId.current;
    setLoading(true);
    setError('');
    attendanceMarksApi.getSheet(f)
      .then((d) => {
        if (id !== reqId.current) return;
        setSheet(d.sheet);
        setSubject(d.subject);
        const loaded = (d.rows || []).map((r) => withMark(r, f.subjectType));
        setRows(loaded);
        rowsRef.current = loaded;
        setNotListed(d.notListed || []);
        setTitleAddon(d.sheet.titleAddon || '');
        setSaveState('idle');
        setLoading(false);
      })
      .catch((e) => { if (id === reqId.current) { setError(e.message); setLoading(false); } });
  }, [f.instCode, f.course, f.batch, f.semester, f.subCode, f.subjectType, f.examYear, f.studentCategory, ready, reloadKey]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ----- auto-hide toast ----- */
  useEffect(() => {
    if (!msg) return undefined;
    const t = setTimeout(() => setMsg(null), 8000);
    return () => clearTimeout(t);
  }, [msg]);

  /* ----- autosave ----- */
  const saveQueued = async (k) => {
    const item = queue.current[k];
    if (!item) return true;
    delete queue.current[k];
    inflight.current += 1;
    setSaveState('saving');
    try {
      await attendanceMarksApi.saveEntry(item.sheetId, item.row.regNo, {
        attendance: item.row.attendance,
        present: item.row.present,
        mark: item.row.mark,
        internalMark: item.row.internalMark
      });
      inflight.current -= 1;
      if (!inflight.current) setSaveState('saved');
      return true;
    } catch (e) {
      inflight.current -= 1;
      setSaveState('error');
      setMsg({ type: 'error', text: e.message });
      return false;
    }
  };

  const schedule = (sheetId, row) => {
    const k = `${sheetId}:${row.regNo}`;
    if (queue.current[k]) clearTimeout(queue.current[k].timer);
    queue.current[k] = { sheetId, row, timer: setTimeout(() => saveQueued(k), 500) };
  };

  const flushSaves = async () => {
    const keys = Object.keys(queue.current);
    keys.forEach((k) => clearTimeout(queue.current[k].timer));
    const results = await Promise.all(keys.map((k) => saveQueued(k)));
    return results.every(Boolean);
  };

  const changeRow = (regNo, patch) => {
    if (!sheet || frozen) return;
    const cur = rowsRef.current.find((r) => r.regNo === regNo);
    if (!cur) return;
    const next = { ...cur, ...patch };
    rowsRef.current = rowsRef.current.map((r) => (r.regNo === regNo ? next : r));
    setRows(rowsRef.current);

    const k = `${sheet._id}:${regNo}`;
    if (rowError(next, f.subjectType, subject)) {
      // invalid values are highlighted but never sent to the server
      if (queue.current[k]) { clearTimeout(queue.current[k].timer); delete queue.current[k]; }
      return;
    }
    schedule(sheet._id, next);
  };

  const changeTitle = (value) => {
    setTitleAddon(value);
    if (!sheet || frozen) return;
    clearTimeout(titleTimer.current);
    const sheetId = sheet._id;
    titleTimer.current = setTimeout(() => {
      setSaveState('saving');
      attendanceMarksApi.updateSheet(sheetId, { titleAddon: value })
        .then(() => setSaveState('saved'))
        .catch((e) => { setSaveState('error'); setMsg({ type: 'error', text: e.message }); });
    }, 600);
  };

  /* ----- lock state of the batch (reloaded only when inst / course / batch / exam year change) -----
     One lock covers every semester, subject, sheet type and student category of the selected
     institution + course + batch + exam year. It is kept on the server, so it does not change
     when another semester or subject is chosen in the dropdowns. */
  const lockScope = { instCode: f.instCode, course: f.course, batch: f.batch, examYear: f.examYear };
  const lockReady = Boolean(f.instCode && f.course && f.batch && f.examYear);

  useEffect(() => {
    if (!lockReady) {
      setLock(null);
      return undefined;
    }
    let cancelled = false;
    setLock(null);
    attendanceMarksApi.lockStatus(lockScope)
      .then((d) => { if (!cancelled) setLock(d); })
      .catch((e) => {
        if (cancelled) return;
        setLock({ locked: false });
        setMsg({ type: 'error', text: `Could not read the lock status: ${e.message}` });
      });
    return () => { cancelled = true; };
  }, [f.instCode, f.course, f.batch, f.examYear]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ----- a sheet that was verified one by one earlier: open it when the batch is not locked ----- */
  useEffect(() => {
    if (!sheet || sheet.status !== 'VERIFIED' || !lock || lock.locked) return;
    let cancelled = false;
    attendanceMarksApi.unlock(sheet._id)
      .then((updated) => { if (!cancelled) setSheet((cur) => (cur && cur._id === sheet._id ? { ...cur, ...updated, status: updated?.status || 'DRAFT' } : cur)); })
      .catch((e) => { if (!cancelled) setMsg({ type: 'error', text: `This sheet is still locked: ${e.message}` }); });
    return () => { cancelled = true; };
  }, [sheet?._id, sheet?.status, lock?.locked]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ----- verify & lock / unlock: the WHOLE batch in one click ----- */
  const scopeLabel = `batch ${f.batch}, ${f.examYear}`;

  const verifyAll = async () => {
    if (!lock || locked || working) return;
    if (rows.some((r) => rowError(r, f.subjectType, subject))) {
      setMsg({ type: 'error', text: 'Fix the highlighted values before verifying' });
      return;
    }
    setWorking(true);
    try {
      // 1. store everything that is still being saved
      clearTimeout(titleTimer.current);
      const saved = await flushSaves();
      if (!saved) throw new Error('Some values could not be saved, so nothing was locked. Please retry.');
      if (sheet && titleAddon !== (sheet.titleAddon || '')) {
        await attendanceMarksApi.updateSheet(sheet._id, { titleAddon });
      }

      // 2. what is still missing in the batch (a warning, the decision is yours)
      const check = await attendanceMarksApi.lockCheck(lockScope);
      const gaps = check.incomplete || [];
      const warning = gaps.length
        ? '\n\nStill missing (attendance or mark):\n' +
          gaps.slice(0, 8).map((g) => `  Semester ${g.semester}  ${g.subCode}: ${g.missing} of ${g.total} students`).join('\n') +
          (gaps.length > 8 ? `\n  and ${gaps.length - 8} more subjects` : '')
        : '';
      if (!window.confirm(
        // `Verify and lock ALL marks of ${scopeLabel}?\n` +
        'Marks have been saved successfully.' 
        // warning
      )) return;

      // 3. lock the batch
      const d = await attendanceMarksApi.verifyAll({ ...lockScope, name: `${f.course}, ${scopeLabel}` });
      setLock(d);
      setSaveState('saved');
      setReloadKey((k) => k + 1); // the open sheet now comes back as VERIFIED
      setMsg({
        type: 'ok',
        text: `All marks of ${scopeLabel} are saved, verified and locked` +
          (d.students ? ` (${d.students} students, ${d.subjects} subjects).` : '.')
      });
    } catch (e) {
      setMsg({ type: 'error', text: e.message });
    } finally {
      setWorking(false);
    }
  };

  const unlockAll = async () => {
    if (!locked || working) return;
    if (!window.confirm(`Unlock for editing?`)) return;
    setWorking(true);
    try {
      const d = await attendanceMarksApi.unlockAll({ ...lockScope, name: `${f.course}, ${scopeLabel}` });
      setLock(d);
      setSaveState('idle');
      setReloadKey((k) => k + 1); // the open sheet comes back as DRAFT (editable)
      setMsg({ type: 'ok', text: `Marks of ${scopeLabel} are unlocked. Every semester and subject can be edited.` });
    } catch (e) {
      setMsg({ type: 'error', text: e.message });
    } finally {
      setWorking(false);
    }
  };

  const printSheet = () => {
    if (rows.length) setShowPrint(true);
  };

  const saveLabel = {
    idle: 'Changes save as you type',
    saving: 'Saving…',
    saved: 'All changes saved',
    error: 'Save failed'
  }[saveState];

  const minMaxLabel = internal ? 'Internal' : f.subjectType === 'Practical' ? 'Practical' : 'External';
  const colCount = internal ? 6 : 7;

  // Subject dropdown: code only; "(Theory)" / "(Practical)" is added only when the same code has both
  const kindOf = (c) => (/practical|clinical/i.test(c || '') ? 'Practical' : 'Theory');
  const codeCount = new Map();
  subjects.forEach((s) => codeCount.set(s.subCodeP1, (codeCount.get(s.subCodeP1) || 0) + 1));
  const subjectOptions = subjects.map((s) => ({
    value: `${s.subCodeP1}::${norm(s.component)}`,
    label: codeCount.get(s.subCodeP1) > 1 ? `${s.subCodeP1} (${s.component})` : s.subCodeP1,
    code: s.subCodeP1,
    kind: kindOf(s.component),
    both: codeCount.get(s.subCodeP1) > 1
  }));
  const wantKind = f.subjectType === 'Practical' ? 'Practical' : 'Theory';

  // The chosen option is kept in state (subKey), so picking "(Practical)" stays on Practical
  // instead of being re-derived (and snapping back to Theory)
  const selectedOpt = subjectOptions.find((o) => o.value === subKey) || null;
  const optionsSignature = subjectOptions.map((o) => o.value).join('|');

  // keep subKey valid for the current option list (default: same code + current type, else first)
  useEffect(() => {
    if (subjectsKey !== batchKey) return;
    setSubKey((cur) => {
      if (subjectOptions.some((o) => o.value === cur)) return cur;
      const pick =
        subjectOptions.find((o) => o.code === f.subCode && o.kind === wantKind) ||
        subjectOptions.find((o) => o.code === f.subCode) ||
        subjectOptions[0];
      return pick ? pick.value : '';
    });
  }, [optionsSignature, subjectsKey, batchKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // the sub code used for the sheet follows the chosen option
  useEffect(() => {
    if (subjectsKey !== batchKey) return;
    const code = subjectOptions.find((o) => o.value === subKey)?.code || '';
    setF((p) => (p.subCode === code ? p : { ...p, subCode: code }));
  }, [subKey, optionsSignature, subjectsKey, batchKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Picking the Theory / Practical entry of a shared code selects that sheet type, because each type
  // keeps its own mark
  const changeSubject = (e) => {
    const opt = subjectOptions.find((o) => o.value === e.target.value);
    if (!opt) return;
    setSubKey(opt.value);
    let type = f.subjectType;
    if (opt.both) type = opt.kind; // 'Theory' or 'Practical'
    update({ subCode: opt.code, subjectType: type });
  };

  const changeSubjectType = (e) => {
    const type = e.target.value;
    if (selectedOpt?.both && type !== 'Internal') {
      const kind = type === 'Practical' ? 'Practical' : 'Theory';
      const alt = subjectOptions.find((o) => o.code === selectedOpt.code && o.kind === kind);
      if (alt) setSubKey(alt.value);
    }
    update({ subjectType: type });
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Attendance &amp; internal marks</h1>
          <p className="page-sub">Enter attendance and internal assessment marks for every semester and subject of the batch, then verify once to lock them all for result processing. Unlock opens everything for editing again. The Theory and the Practical sheet each have their own attendance, mark and exam-day presence; the Internal sheet shows the subject's attendance, the average of the two.</p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="btn" onClick={printSheet} disabled={!rows.length}>Print sheet</button>
          {locked ? (
            <button className="btn" onClick={unlockAll} disabled={working}>
              {working ? 'Unlocking…' : 'Unlock'}
            </button>
          ) : (
            <button className="btn btn-primary" onClick={verifyAll} disabled={!lock || working}>
              {working ? 'Saving and locking…' : 'Verify & lock'}
            </button>
          )}
        </div>
      </div>

      {msg && <p className={`toast ${msg.type}`} role="status">{msg.text}</p>}

      <section className="card">
        {/* Filters */}
        <div className="toolbar" style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'flex-end' }}>
          <FilterSelect
            label="Inst code"
            value={f.instCode}
            options={institutions.map((i) => ({ value: i.instCode, label: i.instCode }))}
            onChange={(e) => update({ instCode: e.target.value })}
            width={140}
          />
          <FilterSelect
            label="Course code"
            value={f.course}
            options={filteredCourses.map((c) => ({ value: c.courseName, label: c.courseName }))}
            onChange={(e) => update({ course: e.target.value, semester: '1' })}
            width={150}
          />
          <FilterSelect
            label="Batch"
            value={f.batch}
            options={batches.map((b) => ({ value: b, label: b }))}
            onChange={(e) => update({ batch: e.target.value })}
            width={140}
          />
          <FilterSelect
            label="Semester"
            value={f.semester}
            options={semesterOptions.map((s) => ({ value: s, label: `Semester ${toRoman(s)}` }))}
            onChange={(e) => update({ semester: e.target.value })}
            width={150}
          />
          <FilterSelect
            label="Subject code"
            value={selectedOpt?.value || ''}
            options={subjectOptions.map((o) => ({ value: o.value, label: o.label }))}
            onChange={changeSubject}
            width={240}
          />
          <FilterSelect
            label="Subject type"
            value={f.subjectType}
            options={SUBJECT_TYPES.map((t) => ({ value: t, label: t }))}
            onChange={changeSubjectType}
            width={140}
          />
          <FilterSelect
            label="Year of exam"
            value={f.examYear}
            options={examYearOptions().map((y) => ({ value: y, label: y }))}
            onChange={(e) => update({ examYear: e.target.value })}
            width={140}
          />
          <FilterSelect
            label="Student category"
            value={f.studentCategory}
            options={STUDENT_CATEGORIES.map((c) => ({ value: c, label: c }))}
            onChange={(e) => update({ studentCategory: e.target.value })}
            width={150}
          />
        </div>

        {/* Info banner */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '24px', padding: '12px 20px', background: 'color-mix(in srgb, var(--bg) 80%, var(--card))', borderTop: '1px solid var(--line)', borderBottom: '1px solid var(--line)', fontSize: '13px', flexWrap: 'wrap' }}>
          <div>Inst name <strong>{currentInst ? currentInst.instName : '—'}</strong></div>
          <div>Degree <strong>{activeCourse?.degree || '—'}</strong></div>
          <div>Course mode <strong>{activeCourse?.mode || '—'}</strong></div>
          <div>Department <strong>{activeCourse?.department || '—'}</strong></div>
          <div>Regulation <strong>{activeCourse?.regulation || '—'}</strong></div>
          <div>Exam pattern <strong>{`${activeCourse?.examPattern || 'SEMESTER'} ${toRoman(f.semester)}`}</strong></div>
          <div>Subject category <strong>{subject?.subjectCategory || '—'}</strong></div>
          <div>Subject name <strong>{subject?.subNameP1 || '—'}</strong></div>
          <div>Status <strong>{!lock ? '—' : locked ? 'VERIFIED' : 'OPEN'}</strong></div>
          <div>{minMaxLabel} min / max <strong>{subject ? `${subject.minMark} / ${subject.maxMark}` : '—'}</strong></div>
          <div>{f.subjectType} mark min / max <strong>{subject ? `${subject.markMin ?? subject.minMark} / ${subject.markMax ?? subject.maxMark}` : '—'}</strong></div>
        </div>

        {/* Students of this batch that are not on the sheet, and why */}
        {notListed.length > 0 && (
          <div style={{ padding: '10px 20px', fontSize: '13px', borderBottom: '1px solid var(--line)', color: 'var(--muted)' }}>
            {notListed.length} student{notListed.length > 1 ? 's' : ''} of batch {f.batch} {notListed.length > 1 ? 'are' : 'is'} not on this sheet:{' '}
            {notListed.map((s, i) => (
              <span key={s.regNo}>
                {i > 0 && '; '}
                <strong style={{ color: 'var(--text)' }}>{s.regNo} {s.studentName}</strong> ({s.reason})
              </span>
            ))}
            . Correct the student profile to list {notListed.length > 1 ? 'them' : 'the student'} here.
          </div>
        )}

        {/* Title add-on + save state */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '16px', padding: '16px 20px', flexWrap: 'wrap' }}>
          <label className="form-label" style={{ minWidth: 260 }}>
            <span>Title add-on</span>
            <input
              className="field"
              placeholder="Optional line printed under the title"
              value={titleAddon}
              disabled={frozen}
              onChange={(e) => changeTitle(e.target.value)}
            />
          </label>
          <small style={{ opacity: 0.75 }}>
            {locked
              ? `Verified and locked${lock.lockedOn ? ` on ${formatDay(lock.lockedOn)}` : ''}${lock.lockedBy ? ` by ${lock.lockedBy}` : ''}. All semesters and subjects of ${scopeLabel}.`
              : saveLabel}
          </small>
        </div>

        {/* Table (columns depend on the subject type) */}
        <div className={`table-responsive ${loading ? 'is-loading' : ''}`}>
          <table className="custom-table">
            <thead>
              <tr>
                <th className="sno">S.No</th>
                <th>Register no</th>
                <th>Student name</th>
                <th>Attendance %</th>
                <th>{f.subjectType} mark (max {subject?.markMax ?? subject?.maxMark ?? '—'})</th>
                <th>Status</th>
                {!internal && <th>Present</th>}
              </tr>
            </thead>
            <tbody>
              {error && <tr><td colSpan={colCount} className="empty error-cell">{error} <button className="btn" onClick={() => setReloadKey((k) => k + 1)}>Retry</button></td></tr>}
              {!error && !loading && rows.length === 0 && (
                <tr><td colSpan={colCount} className="empty">{ready ? 'No students found for the selected filters.' : 'Select all filters to load the sheet.'}</td></tr>
              )}
              {!error && rows.map((r, i) => {
                const err = rowError(r, f.subjectType, subject);
                const attInvalid = r.attendance !== null && (r.attendance < 0 || r.attendance > 100);
                return (
                  <tr key={r.regNo}>
                    <td className="sno">{i + 1}</td>
                    <td><strong>{r.regNo}</strong></td>
                    <td>
                      {r.studentName}
                      {r.note && <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{r.note}</div>}
                    </td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.5"
                        className={`field ${attInvalid ? 'invalid' : ''}`}
                        style={{ width: 90 }}
                        value={r.attendance ?? ''}
                        disabled={frozen || Boolean(r.attendanceCalculated)}
                        title={
                          attInvalid ? err
                            : r.attendanceCalculated ? 'Average of the Theory and Practical sheets. Change it there.'
                              : ''
                        }
                        onChange={(e) => changeRow(r.regNo, { attendance: toNum(e.target.value) })}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        step="0.5"
                        className={`field ${err && !attInvalid ? 'invalid' : ''}`}
                        style={{ width: 90 }}
                        value={r.mark ?? ''}
                        disabled={frozen}
                        title={err && !attInvalid ? err : ''}
                        onChange={(e) => {
                          const v = toNum(e.target.value);
                          changeRow(r.regNo, { mark: v, internalMark: internal ? v : r.internalMark });
                        }}
                      />
                    </td>
                    <td>
                      {internalStatus(r, subject) === '—'
                        ? '—'
                        : <span className={`badge ${internalStatus(r, subject) === 'Pass' ? 'active' : 'inactive'}`}>{internalStatus(r, subject)}</span>}
                    </td>
                    {!internal && (
                      <td>
                        <input
                          type="checkbox"
                          checked={Boolean(r.present)}
                          disabled={frozen}
                          aria-label={`Present - ${r.studentName}`}
                          onChange={(e) => changeRow(r.regNo, { present: e.target.checked })}
                        />
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {showPrint && (
        <AttendancePrintModal
          onClose={() => setShowPrint(false)}
          f={f}
          instName={currentInst?.instName || f.instCode}
          department={activeCourse?.department}
          semesterRoman={toRoman(f.semester)}
          subject={subject}
          titleAddon={titleAddon}
          rows={rows.map((r) => ({ ...r, internalMark: r.mark }))}
        />
      )}
    </>
  );
}
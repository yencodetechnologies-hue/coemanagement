const Institution = require('../models/Institution');
const Course = require('../models/Course');
const Curriculum = require('../models/Curriculum');
const TheoryTimeTable = require('../models/TheoryTimeTable');

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const fail = (res, code, message) => res.status(code).json({ success: false, message });

// "Semester VI" -> 6
const termOf = (semester) => {
  const m = /([ivx]+)\s*$/i.exec(String(semester || '').trim());
  const i = m ? ROMAN.indexOf(m[1].toUpperCase()) : -1;
  return i + 1;
};

// one key per subject code + component, so a Theory and a Practical record of the same code stay separate
const compKey = (code, component) => `${code}::${String(component || '').trim().toLowerCase()}`;
const isPractical = (component) => /practical|clinical/i.test(component || '');

// GET /options?instCode=&course=
exports.getOptions = async (req, res) => {
  try {
    const { instCode, course } = req.query;

    const institutions = await Institution.find({ status: 'Active' })
      .sort({ instName: 1 })
      .select('instCode instName')
      .lean();

    let courses = [];
    let terms = 0;
    if (instCode) {
      courses = await Course.find({ instCode, status: 'Active' })
        .sort({ courseCode: 1 })
        .select('courseCode courseName noOfTerms')
        .lean();
      if (course) terms = courses.find((c) => c.courseCode === course)?.noOfTerms || 0;
    }

    res.json({ success: true, data: { institutions, courses, terms } });
  } catch (err) {
    fail(res, 500, err.message);
  }
};

// GET /subjects?instCode=&course=&semester=&examYear=
exports.getSubjects = async (req, res) => {
  try {
    const { instCode, course: courseCode, semester, examYear } = req.query;
    if (!instCode || !courseCode || !semester || !examYear) {
      return fail(res, 400, 'instCode, course, semester and examYear are required');
    }

    const course = await Course.findOne({ instCode, courseCode }).lean();
    if (!course) return fail(res, 404, 'Course not found for this institution');

    // Curriculum stores the semester as a number string ("6"); also accept "VI" / "Semester VI"
    const term = termOf(semester);
    const roman = ROMAN[term - 1] || '';
    const semesterValues = [String(term), roman, `Semester ${roman}`, semester].filter(Boolean);

    const [inst, curriculum, saved] = await Promise.all([
      Institution.findOne({ instCode: instCode.toUpperCase() }).lean(),
      Curriculum.find({
        instCode,
        course: { $in: [courseCode, course.courseName] }, // code or name, whichever you store
        regulation: course.regulation,
        semester: { $in: semesterValues },
        // every component (Theory, Practical, Clinical ...) - no component filter
        status: 'Active',
      })
        .sort({ subCodeP1: 1 })
        .lean(),
      TheoryTimeTable.findOne({ instCode, course: courseCode, semester, examYear }).lean(),
    ]);

    // one row per subject code + component (Theory and Practical of the same code are both listed)
    const bySubject = new Map();
    curriculum.forEach((c) => {
      const key = compKey(c.subCodeP1, c.component);
      if (!bySubject.has(key)) bySubject.set(key, c);
    });

    // saved entries: new ones carry the component; older ones (no component) belong to the Theory row
    const savedByKey = new Map();
    const legacyByCode = new Map();
    (saved?.entries || []).forEach((e) => {
      if (e.component) savedByKey.set(compKey(e.subCode, e.component), e);
      else legacyByCode.set(e.subCode, e);
    });
    const savedFor = (c) =>
      savedByKey.get(compKey(c.subCodeP1, c.component)) ||
      (isPractical(c.component) ? null : legacyByCode.get(c.subCodeP1)) ||
      null;

    const rows = [...bySubject.values()]
      .sort(
        (a, b) =>
          String(a.subCodeP1).localeCompare(String(b.subCodeP1), undefined, { numeric: true }) ||
          String(a.component).localeCompare(String(b.component))
      )
      .map((c) => {
        const e = savedFor(c);
        return {
          subCode: c.subCodeP1,
          subName: c.subNameP1,
          component: c.component || '',
          conductedBy: c.examConductedBy || 'University',
          examDate: e?.examDate || '',
          session: e?.session || '',
        };
      });

    res.json({
      success: true,
      data: {
        info: {
          instName: inst?.instName || instCode,
          headDesignation: inst?.headDesignation || '',
          courseName: course.courseName,
          degree: course.degree,
          courseMode: course.mode,
          department: course.department,
          regulation: course.regulation,
          examPattern: course.examPattern,
        },
        rows,
        saved: !!saved,
      },
    });
  } catch (err) {
    fail(res, 500, err.message);
  }
};

// GET /saved?instCode=
exports.getSaved = async (req, res) => {
  try {
    const filter = req.query.instCode ? { instCode: req.query.instCode } : {};
    const docs = await TheoryTimeTable.find(filter).sort({ updatedAt: -1 }).lean();

    res.json({
      success: true,
      data: docs.map((d) => ({
        _id: d._id,
        instCode: d.instCode,
        course: d.course,
        semester: d.semester,
        term: d.term,
        regulation: d.regulation,
        examPattern: d.examPattern,
        examYear: d.examYear,
        papers: d.entries.length,
      })),
    });
  } catch (err) {
    fail(res, 500, err.message);
  }
};

// PUT /   body: { instCode, course, semester, examYear, entries: [...] }
exports.saveTimeTable = async (req, res) => {
  try {
    const { instCode, course: courseCode, semester, examYear, entries } = req.body;
    if (!instCode || !courseCode || !semester || !examYear || !Array.isArray(entries)) {
      return fail(res, 400, 'instCode, course, semester, examYear and entries are required');
    }

    const clean = [];
    for (const e of entries) {
      if (!e.subCode) return fail(res, 400, 'Every entry needs a subject code');
      if (!DATE_RE.test(e.examDate || '')) {
        return fail(res, 400, `Invalid exam date for ${e.subCode}`);
      }
      if (!['FN', 'AN'].includes(e.session)) {
        return fail(res, 400, `Invalid session for ${e.subCode}`);
      }
      clean.push({
        subCode: e.subCode,
        subName: e.subName || '',
        component: e.component || '',
        conductedBy: e.conductedBy || 'University',
        examDate: e.examDate,
        session: e.session,
      });
    }

    const course = await Course.findOne({ instCode, courseCode }).lean();
    if (!course) return fail(res, 404, 'Course not found for this institution');

    const doc = await TheoryTimeTable.findOneAndUpdate(
      { instCode, course: courseCode, semester, examYear },
      {
        $set: {
          term: termOf(semester),
          regulation: course.regulation,
          examPattern: course.examPattern,
          entries: clean,
          updatedBy: String(req.admin?._id || ''),
        },
      },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );

    res.json({ success: true, data: { _id: doc._id, papers: doc.entries.length } });
  } catch (err) {
    fail(res, 500, err.message);
  }
};

// DELETE /:id
exports.deleteTimeTable = async (req, res) => {
  try {
    const doc = await TheoryTimeTable.findByIdAndDelete(req.params.id);
    if (!doc) return fail(res, 404, 'Time table not found');
    res.json({ success: true, data: { _id: doc._id } });
  } catch (err) {
    fail(res, 500, err.message);
  }
};
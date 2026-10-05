const mongoose = require('mongoose');

const entrySchema = new mongoose.Schema(
  {
    subCode: { type: String, required: true, trim: true },
    subName: { type: String, default: '', trim: true },
    // Theory / Practical / Clinical. Needed so the Theory and the Practical paper of the SAME
    // subject code keep their own date. Without this field Mongoose silently drops the value.
    component: { type: String, default: '', trim: true },
    conductedBy: { type: String, default: 'University' },
    examDate: { type: String, required: true }, // yyyy-mm-dd
    session: { type: String, enum: ['FN', 'AN'], required: true },
  },
  { _id: false }
);

const theoryTimeTableSchema = new mongoose.Schema(
  {
    instCode: { type: String, required: true, trim: true },
    course: { type: String, required: true, trim: true },   // course code
    semester: { type: String, required: true, trim: true },  // e.g. "Semester VI"
    term: { type: Number, required: true },                  // 6
    regulation: { type: String, default: '' },
    examPattern: { type: String, default: '' },
    examYear: { type: String, required: true, trim: true },  // e.g. "MAR-2025"
    entries: { type: [entrySchema], default: [] },
    updatedBy: { type: String, default: '' },
  },
  { timestamps: true }
);

theoryTimeTableSchema.index(
  { instCode: 1, course: 1, semester: 1, examYear: 1 },
  { unique: true }
);

module.exports = mongoose.model('TheoryTimeTable', theoryTimeTableSchema);
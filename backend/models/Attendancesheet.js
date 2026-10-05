const mongoose = require('mongoose');

const attendanceSheetSchema = new mongoose.Schema(
  {
    instCode: { type: String, required: true, trim: true },
    course: { type: String, required: true, trim: true },
    batch: { type: String, required: true, trim: true },
    semester: { type: String, required: true, trim: true },
    subCode: { type: String, required: true, trim: true },
    subjectType: { type: String, enum: ['Theory', 'Practical', 'Internal'], required: true },
    examYear: { type: String, required: true, trim: true },
    studentCategory: { type: String, required: true, trim: true },

    titleAddon: { type: String, default: '', trim: true },
    status: { type: String, enum: ['DRAFT', 'VERIFIED'], default: 'DRAFT' },
    verifiedAt: { type: Date }
  },
  { timestamps: true }
);

// One sheet per unique combination of filters
attendanceSheetSchema.index(
  { instCode: 1, course: 1, batch: 1, semester: 1, subCode: 1, subjectType: 1, examYear: 1, studentCategory: 1 },
  { unique: true }
);

module.exports = mongoose.model('AttendanceSheet', attendanceSheetSchema);
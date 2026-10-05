const mongoose = require('mongoose');

const settingSchema = new mongoose.Schema(
  {
    instCode: { type: String, required: true, trim: true },
    course: { type: String, required: true, trim: true },
    batch: { type: String, required: true, trim: true },
    semester: { type: String, required: true, trim: true },
    examYear: { type: String, required: true, trim: true },
    studentCategory: { type: String, required: true, trim: true },

    addOnTitle: { type: String, default: '', trim: true },
    lastDate: { type: String, default: '' },     // yyyy-mm-dd
    penaltyDate: { type: String, default: '' },  // yyyy-mm-dd
    applicationCost: { type: Number, default: 0, min: 0 },
    markSheetCost: { type: Number, default: 0, min: 0 },
    provisional1Cost: { type: Number, default: 0, min: 0 },
    provisional2Cost: { type: Number, default: 0, min: 0 },
    convocationCost: { type: Number, default: 0, min: 0 },
    penalty: { type: Number, default: 0, min: 0 },
    applyPenalty: { type: Boolean, default: false },
  },
  { timestamps: true }
);

settingSchema.index(
  { instCode: 1, course: 1, batch: 1, semester: 1, examYear: 1, studentCategory: 1 },
  { unique: true }
);

module.exports = mongoose.model('ExamApplicationSetting', settingSchema);
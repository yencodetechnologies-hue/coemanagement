const mongoose = require('mongoose');
const { Schema } = mongoose;

// One document per processed result (institution + course + batch + semester + exam year).
// While PUBLISHED, the page and every statement read this frozen copy, so later mark
// corrections do not silently change a result. Withdraw, correct, publish again.
const resultSheetSchema = new Schema(
  {
    instCode: { type: String, required: true, trim: true },
    course: { type: String, required: true, trim: true },
    batch: { type: String, required: true, trim: true },
    semester: { type: String, required: true, trim: true },
    examYear: { type: String, required: true, trim: true },

    status: { type: String, enum: ['PUBLISHED', 'WITHDRAWN'], default: 'PUBLISHED' },

    // frozen copy taken at publish time
    info: { type: Schema.Types.Mixed, default: {} },
    subjects: { type: [Schema.Types.Mixed], default: [] },
    rows: { type: [Schema.Types.Mixed], default: [] }, // each row keeps its statementNo
    stats: { type: Schema.Types.Mixed, default: {} },
    gradingScale: { type: [Schema.Types.Mixed], default: [] },

    publishedOn: { type: Date, default: null },
    publishedBy: { type: String, default: '' },
    withdrawnOn: { type: Date, default: null },
  },
  { timestamps: true, minimize: false }
);

resultSheetSchema.index(
  { instCode: 1, course: 1, batch: 1, semester: 1, examYear: 1 },
  { unique: true }
);

module.exports = mongoose.model('ResultSheet', resultSheetSchema);
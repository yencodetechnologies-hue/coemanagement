const { Schema, model } = require('mongoose');

// One document (key: 'main') holds every setting shown on the Settings page.
const SettingsSchema = new Schema(
  {
    key: { type: String, default: 'main', unique: true },
    university: {
      name: { type: String, required: true, trim: true },
      shortName: { type: String, required: true, trim: true },
      recognition: { type: String, trim: true, default: '' },
      address: { type: String, trim: true, default: '' },
      signatoryTitle: { type: String, required: true, trim: true },
    },
    gradingScale: [
      {
        _id: false,
        grade: { type: String, required: true, trim: true },
        description: { type: String, required: true, trim: true },
        minPercent: { type: Number, required: true, min: 0, max: 100 },
        gradePoint: { type: Number, required: true, min: 0 },
      },
    ],
    sessions: [{ _id: false, name: { type: String, required: true }, active: { type: Boolean, default: false } }],
    nextGradeStatementSerial: { type: Number, default: 1, min: 1 },
  },
  { timestamps: true }
);

module.exports = model('Settings', SettingsSchema);
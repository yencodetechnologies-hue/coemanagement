const mongoose = require('mongoose');
const { Schema } = mongoose;

// The serial number issued for one candidate's consolidated grade statement.
// One document per candidate; earlier serial numbers are kept in `history`.
const consolidatedStatementSchema = new Schema(
  {
    instCode: { type: String, required: true, trim: true },
    course: { type: String, required: true, trim: true },
    batch: { type: String, required: true, trim: true },
    regNo: { type: String, required: true, trim: true },

    serialNo: { type: Number, required: true },
    issuedOn: { type: Date, default: Date.now },
    issuedBy: { type: String, default: '' },

    // which published results the statement was built from; when it changes
    // (a new semester or a reappear result is published) the next print gets a new serial
    fingerprint: { type: String, default: '' },

    history: [
      {
        _id: false,
        serialNo: Number,
        issuedOn: Date,
        issuedBy: String,
      },
    ],
  },
  { timestamps: true }
);

consolidatedStatementSchema.index({ instCode: 1, course: 1, batch: 1, regNo: 1 }, { unique: true });
consolidatedStatementSchema.index({ serialNo: 1 });

module.exports = mongoose.model('ConsolidatedStatement', consolidatedStatementSchema);
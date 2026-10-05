const mongoose = require('mongoose');
const { Schema } = mongoose;

// Record of a provisional certificate issued to one candidate.
// The first print fixes the date of issue; later prints only count up.
const provisionalCertificateSchema = new Schema(
  {
    instCode: { type: String, required: true, trim: true },
    course: { type: String, required: true, trim: true },
    batch: { type: String, required: true, trim: true },
    regNo: { type: String, required: true, trim: true },

    issuedOn: { type: Date, default: Date.now },
    issuedBy: { type: String, default: '' },
    printCount: { type: Number, default: 0 },
    lastPrintedOn: { type: Date, default: null },

    // what the certificate said when it was last printed
    cgpa: { type: Number, default: null },
    examYear: { type: String, default: '' },
  },
  { timestamps: true }
);

provisionalCertificateSchema.index({ instCode: 1, course: 1, batch: 1, regNo: 1 }, { unique: true });

module.exports = mongoose.model('ProvisionalCertificate', provisionalCertificateSchema);
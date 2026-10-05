const mongoose = require('mongoose');
const { Schema } = mongoose;

const entrySchema = new Schema(
  {
    regNo: { type: String, required: true },
    barcode: { type: String, required: true },
  },
  { _id: false }
);

const barcodeMappingSchema = new Schema(
  {
    // the paper that was mapped
    instCode: { type: String, required: true },
    course: { type: String, required: true },
    batch: { type: String, required: true },
    semester: { type: String, required: true },
    examYear: { type: String, required: true },
    subCode: { type: String, required: true }, // subject code 1
    subCode2: { type: String, default: '' }, // subject code 2 (combined papers)
    paperCode: { type: String, required: true }, // "PHAR205-PATH210" or just "PHAR205"
    subjectName: { type: String, default: '' },
    subjectType: { type: String, enum: ['THEORY', 'PRACTICAL'], default: 'THEORY' },

    // how the barcodes were made: AUTO = generated, MANUAL = typed / scanned in
    mode: { type: String, enum: ['AUTO', 'MANUAL'], default: 'AUTO' },

    // snapshot shown in the info strips (inst name, degree, regulation ...)
    info: { type: Schema.Types.Mixed, default: {} },

    status: { type: String, enum: ['DRAFT', 'VERIFIED'], default: 'DRAFT' },
    mappedOn: { type: Date, default: Date.now },
    verifiedOn: { type: Date, default: null },
    verifiedBy: { type: Schema.Types.ObjectId, default: null },

    entries: [entrySchema],
  },
  { timestamps: true }
);

// one mapping per paper: subject code + type, so the Theory and the Practical paper of the same
// code each have their own mapping (the old index had no subjectType)
barcodeMappingSchema.index(
  { instCode: 1, course: 1, batch: 1, semester: 1, examYear: 1, subCode: 1, subjectType: 1 },
  { unique: true }
);
barcodeMappingSchema.index({ instCode: 1, examYear: 1, 'entries.barcode': 1 }); // barcode uniqueness lookups

module.exports = mongoose.model('BarcodeMapping', barcodeMappingSchema);
const mongoose = require('mongoose');
const { Schema } = mongoose;

// evaluators only ever see barcodes, never register numbers
const scriptSchema = new Schema(
  {
    barcode: { type: String, required: true },
    mark: { type: Number, default: null }, // written by the marks-entry screen
  },
  { _id: false }
);

const packetSchema = new Schema(
  {
    packetNo: { type: Number, required: true },
    scripts: [scriptSchema],
    evaluator: { type: Schema.Types.ObjectId, ref: 'Evaluator', default: null },
  },
  { _id: false }
);

const rebundleSchema = new Schema(
  {
    mapping: { type: Schema.Types.ObjectId, ref: 'BarcodeMapping', required: true, unique: true },
    packetSize: { type: Number, required: true },
    packets: [packetSchema],
    bundledOn: { type: Date, default: Date.now },
    bundledBy: { type: Schema.Types.ObjectId, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Rebundle', rebundleSchema);
const mongoose = require('mongoose');

const evaluatorSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, trim: true },
    mobile: { type: String, trim: true },
    instCode: { type: String, trim: true },
    department: { type: String, trim: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Evaluator', evaluatorSchema);
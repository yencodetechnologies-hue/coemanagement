const { Schema, model } = require('mongoose');

const InstitutionSchema = new Schema(
  {
    instCode: { type: String, required: true, unique: true, uppercase: true, trim: true },
    instName: { type: String, required: true, trim: true },
    discipline: { type: String, required: true, trim: true },
    headDesignation: { type: String, trim: true, default: '' },
    city: { type: String, trim: true, default: '' },
    phone: { type: String, trim: true, default: '' },
    email: { type: String, trim: true, lowercase: true, default: '' },
    status: { type: String, enum: ['Active', 'Inactive'], default: 'Active' },
  },
  { timestamps: true }
);

InstitutionSchema.index({ instName: 1 });

module.exports = model('Institution', InstitutionSchema);
const mongoose = require('mongoose');

const coeStaffSchema = new mongoose.Schema({
  employeeId: { type: String, required: true, unique: true, trim: true },
  fullName: { type: String, required: true, trim: true },
  designation: { type: String, required: true, default: 'Data Entry Operator' },
  accessRole: { type: String, required: true, default: 'Data Entry Operator' },
  department: { type: String, default: '', trim: true },
  institutionScope: { type: String, required: true, default: 'All' },
  email: { type: String, default: '', trim: true, lowercase: true },
  phone: { type: String, default: '', trim: true },
  dateOfJoining: { type: String, default: '' },
  status: { type: String, enum: ['Active', 'Inactive'], default: 'Active' }
}, { timestamps: true });

module.exports = mongoose.model('CoeStaff', coeStaffSchema);
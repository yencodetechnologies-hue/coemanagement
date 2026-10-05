const mongoose = require('mongoose');
const { Schema } = mongoose;

// An access role. Staff belong to a role through CoeStaff.accessRole (the role NAME).
const roleSchema = new Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    order: { type: Number, default: 1000 }, // position in the list
    // { <module key>: { view, create, edit, verify, delete } }
    permissions: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, minimize: false }
);

module.exports = mongoose.model('Role', roleSchema);
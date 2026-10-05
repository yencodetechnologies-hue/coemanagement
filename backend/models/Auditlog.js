const mongoose = require('mongoose');
const { Schema } = mongoose;

// One document per change made through the API (create / update / delete / publish ...).
// Written by middleware/auditLogger.js. There is no route that edits or deletes a log.
const auditLogSchema = new Schema(
  {
    // who (the staff selected in the header when the change was made)
    staffId: { type: String, default: '' },
    employeeId: { type: String, default: '' },
    staffName: { type: String, default: 'Unknown staff' },
    designation: { type: String, default: '' },
    accessRole: { type: String, default: '' },

    // what
    action: { type: String, required: true },  // Created / Updated / Deleted / Published ...
    module: { type: String, default: '' },     // e.g. "Staff", "Result processing"
    summary: { type: String, default: '' },    // one readable line
    targetModel: { type: String, default: '' },
    targetId: { type: String, default: '' },

    // details
    changes: [{ _id: false, field: String, from: Schema.Types.Mixed, to: Schema.Types.Mixed }],
    details: { type: Schema.Types.Mixed, default: {} }, // what was sent (and the deleted record)

    // request
    method: { type: String, default: '' },
    path: { type: String, default: '' },
    statusCode: { type: Number, default: 0 },
    success: { type: Boolean, default: true },
    message: { type: String, default: '' },
    ip: { type: String, default: '' },
  },
  { timestamps: { createdAt: true, updatedAt: false }, minimize: false }
);

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ staffId: 1, createdAt: -1 });
auditLogSchema.index({ module: 1, createdAt: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
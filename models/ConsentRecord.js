const mongoose = require('mongoose');

const ConsentRecordSchema = new mongoose.Schema({
  subscriber: { type: mongoose.Schema.Types.ObjectId, ref: 'Subscriber', index: true },
  email: { type: String, index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', index: true },
  type: { type: String, enum: ['signup','resubscribe','preference-update'], default: 'signup' },
  method: { type: String, enum: ['double-opt-in','single-opt-in','manual','import'], default: 'double-opt-in' },
  ip: String,
  userAgent: String,
  metadata: mongoose.Schema.Types.Mixed,
  occurredAt: { type: Date, default: Date.now }
}, { timestamps: true });

ConsentRecordSchema.index({ email: 1, type: 1, occurredAt: -1 });

module.exports = mongoose.model('ConsentRecord', ConsentRecordSchema);

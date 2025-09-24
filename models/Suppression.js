const mongoose = require('mongoose');

const SuppressionSchema = new mongoose.Schema({
  email: { type: String, required: true, lowercase: true, index: true, trim: true },
  type: { type: String, required: true, enum: ['unsubscribe', 'bounce', 'complaint', 'manual'], index: true },
  reason: { type: String },
  source: { type: String, enum: ['system', 'user', 'webhook', 'import', 'api'], default: 'system' },
  meta: { type: mongoose.Schema.Types.Mixed },
  count: { type: Number, default: 1 },
  lastEventAt: { type: Date, default: Date.now },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization' }
}, { timestamps: true });

SuppressionSchema.index({ email: 1, type: 1, organization: 1 }, { unique: true, sparse: true });

SuppressionSchema.statics.recordEvent = async function({ email, type, reason, source = 'system', meta = {}, user, organization }) {
  email = (email || '').toLowerCase().trim();
  if (!email) throw new Error('Email required');
  const update = {
    $setOnInsert: { reason, source, meta },
    $set: { lastEventAt: new Date() },
    $inc: { count: 1 }
  };
  return this.findOneAndUpdate({ email, type, organization: organization || null }, update, { upsert: true, new: true });
};

module.exports = mongoose.model('Suppression', SuppressionSchema);

const mongoose = require('mongoose');

const DomainReputationSchema = new mongoose.Schema({
  domain: { type: String, required: true, index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  windowStart: { type: Date, required: true, index: true },
  windowType: { type: String, enum: ['hour','day'], required: true },
  sends: { type: Number, default: 0 },
  delivered: { type: Number, default: 0 },
  bounces: { type: Number, default: 0 },
  complaints: { type: Number, default: 0 },
  opens: { type: Number, default: 0 },
  clicks: { type: Number, default: 0 },
  lastEventAt: { type: Date },
}, { timestamps: true });

DomainReputationSchema.index({ domain: 1, windowType: 1, windowStart: 1 }, { unique: true });

module.exports = mongoose.model('DomainReputation', DomainReputationSchema);

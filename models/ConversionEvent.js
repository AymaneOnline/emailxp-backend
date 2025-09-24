const mongoose = require('mongoose');

const conversionEventSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  subscriberId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subscriber', index: true },
  campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign', index: true },
  type: { type: String, required: true }, // e.g. purchase, signup, upgrade
  value: { type: Number, default: 0 },
  currency: { type: String, default: 'USD' },
  metadata: { type: mongoose.Schema.Types.Mixed },
  occurredAt: { type: Date, default: Date.now, index: true },
  attribution: {
    model: { type: String, enum: ['last_touch', 'first_touch'], default: 'last_touch' },
    source: { type: String }, // e.g. 'pixel', 'api', 'webhook'
  }
}, { timestamps: true });

conversionEventSchema.index({ user:1, occurredAt:-1 });
conversionEventSchema.index({ campaignId:1, occurredAt:-1 });
conversionEventSchema.index({ subscriberId:1, occurredAt:-1 });

module.exports = mongoose.model('ConversionEvent', conversionEventSchema);

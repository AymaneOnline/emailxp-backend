const mongoose = require('mongoose');

const OnboardingEventSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  event: { type: String, required: true, index: true },
  payload: { type: Object },
  ts: { type: Date, default: Date.now, index: true }
}, {
  versionKey: false
});

OnboardingEventSchema.index({ userId: 1, event: 1, ts: -1 });

module.exports = mongoose.model('OnboardingEvent', OnboardingEventSchema);

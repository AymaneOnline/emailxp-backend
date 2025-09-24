const mongoose = require('mongoose');

const preferenceCategorySchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  name: { type: String, required: true, trim: true },
  key: { type: String, required: true, trim: true },
  description: { type: String, trim: true },
  isDefault: { type: Boolean, default: false },
  isArchived: { type: Boolean, default: false },
}, { timestamps: true });

preferenceCategorySchema.index({ user: 1, key: 1 }, { unique: true });

module.exports = mongoose.model('PreferenceCategory', preferenceCategorySchema);

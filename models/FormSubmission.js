const mongoose = require('mongoose');

const FormSubmissionSchema = new mongoose.Schema({
  form: { type: mongoose.Schema.Types.ObjectId, ref: 'Form', required: false },
  submittedAt: { type: Date, default: Date.now },
  data: { type: mongoose.Schema.Types.Mixed, default: {} },
  ip: { type: String },
  userAgent: { type: String }
}, { timestamps: true });

module.exports = mongoose.model('FormSubmission', FormSubmissionSchema);

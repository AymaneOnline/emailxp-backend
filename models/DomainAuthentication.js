const mongoose = require('mongoose');

const dkimKeySchema = new mongoose.Schema({
  selector: { type: String, required: true },
  publicKey: { type: String, required: true },
  privateKey: { type: String, required: true, select: false },
  createdAt: { type: Date, default: Date.now }
}, { _id: false });

const DomainAuthSchema = new mongoose.Schema({
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  domain: { type: String, required: true, lowercase: true, trim: true, unique: true },
  dkim: dkimKeySchema,
  dkimVerified: { type: Boolean, default: false },
  spfVerified: { type: Boolean, default: false },
  dmarcPolicy: { type: String, enum: ['none','quarantine','reject', null], default: null },
  dmarcVerified: { type: Boolean, default: false },
  trackingCname: { type: String },
  trackingVerified: { type: Boolean, default: false },
  verificationTokens: {
    dkim: { type: String }, // For explicit token-based checks if used
    spf: { type: String },
    tracking: { type: String }
  },
  bounceToken: { type: String, index: true },
  lastCheckedAt: { type: Date },
  status: { type: String, enum: ['pending','partially_verified','verified','error'], default: 'pending', index: true },
  error: { type: String },
  dkimError: { type: String, default: null },
  spfError: { type: String, default: null },
  trackingError: { type: String, default: null },
  mxError: { type: String, default: null },
  isPrimary: { type: Boolean, default: false, index: true }
}, { timestamps: true });


module.exports = mongoose.model('DomainAuthentication', DomainAuthSchema);

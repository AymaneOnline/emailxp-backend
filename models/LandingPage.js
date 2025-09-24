const mongoose = require('mongoose');

const landingPageSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    default: ''
  },
  slug: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  design: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  htmlContent: {
    type: String,
    default: ''
  },
  status: {
    type: String,
    enum: ['draft', 'published', 'archived'],
    default: 'draft'
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  visits: {
    type: Number,
    default: 0
  },
  conversions: {
    type: Number,
    default: 0
  },
  formIntegration: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Form',
    default: null
  },
  seo: {
    title: {
      type: String,
      default: ''
    },
    description: {
      type: String,
      default: ''
    },
    keywords: {
      type: String,
      default: ''
    }
  },
  customDomain: {
    type: String,
    default: ''
  },
  publishedAt: {
    type: Date
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Index for performance
landingPageSchema.index({ user: 1, status: 1 });
landingPageSchema.index({ user: 1, createdAt: -1 });

// Update the updatedAt field before saving
landingPageSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('LandingPage', landingPageSchema);
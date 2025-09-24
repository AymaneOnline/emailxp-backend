// emailxp/backend/models/BehavioralEvent.js

const mongoose = require('mongoose');

const behavioralEventSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  subscriber: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subscriber',
    required: true,
    index: true
  },
  // Type of behavioral event
  eventType: {
    type: String,
    required: true,
    enum: [
      'page_view', 
      'product_view', 
      'cart_add', 
      'cart_remove', 
      'purchase', 
      'form_submit', 
      'link_click', 
      'video_view',
      'download',
      'custom'
    ]
  },
  // Custom event type for 'custom' events
  customEventType: {
    type: String,
    trim: true,
    maxlength: 100
  },
  // URL or identifier of the page/product/etc.
  target: {
    type: String,
    trim: true,
    maxlength: 2000
  },
  // Additional data about the event
  data: {
    type: mongoose.Schema.Types.Mixed
  },
  // Campaign that triggered this event (if applicable)
  campaign: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Campaign'
  },
  // Timestamp of when the event occurred
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  },
  // IP address for geo-location
  ipAddress: {
    type: String,
    trim: true
  },
  // User agent for device detection
  userAgent: {
    type: String,
    trim: true
  },
  // Session identifier
  sessionId: {
    type: String,
    trim: true
  }
}, {
  timestamps: true
});

// Indexes for better performance
behavioralEventSchema.index({ user: 1, eventType: 1 });
behavioralEventSchema.index({ subscriber: 1, eventType: 1 });
behavioralEventSchema.index({ user: 1, timestamp: -1 });
behavioralEventSchema.index({ subscriber: 1, timestamp: -1 });
behavioralEventSchema.index({ user: 1, target: 1 });
behavioralEventSchema.index({ sessionId: 1, timestamp: -1 });

// Virtual for event description
behavioralEventSchema.virtual('description').get(function() {
  switch (this.eventType) {
    case 'page_view':
      return `Visited ${this.target}`;
    case 'product_view':
      return `Viewed product ${this.target}`;
    case 'cart_add':
      return `Added to cart: ${this.target}`;
    case 'cart_remove':
      return `Removed from cart: ${this.target}`;
    case 'purchase':
      return `Made a purchase${this.target ? ` of ${this.target}` : ''}`;
    case 'form_submit':
      return `Submitted form${this.target ? ` on ${this.target}` : ''}`;
    case 'link_click':
      return `Clicked link${this.target ? ` to ${this.target}` : ''}`;
    case 'video_view':
      return `Watched video${this.target ? ` ${this.target}` : ''}`;
    case 'download':
      return `Downloaded${this.target ? ` ${this.target}` : ''}`;
    case 'custom':
      return `${this.customEventType}${this.target ? `: ${this.target}` : ''}`;
    default:
      return `${this.eventType}${this.target ? ` ${this.target}` : ''}`;
  }
});

module.exports = mongoose.model('BehavioralEvent', behavioralEventSchema);
// emailxp/backend/models/Automation.js

const mongoose = require('mongoose');

const automationSchema = mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'User',
    },
    name: {
      type: String,
      required: [true, 'Please add a name'],
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    nodes: [
      {
        id: {
          type: String,
          required: true,
        },
        type: {
          type: String,
          required: true,
        },
        position: {
          x: {
            type: Number,
            required: true,
          },
          y: {
            type: Number,
            required: true,
          },
        },
        data: {
          type: mongoose.Schema.Types.Mixed,
          required: true,
        },
      },
    ],
    edges: [
      {
        id: {
          type: String,
          required: true,
        },
        source: {
          type: String,
          required: true,
        },
        target: {
          type: String,
          required: true,
        },
        sourceHandle: String,
        targetHandle: String,
      },
    ],
    isActive: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      enum: ['draft', 'running', 'paused', 'completed'],
      default: 'draft',
    },
    stats: {
      totalSent: {
        type: Number,
        default: 0,
      },
      totalOpened: {
        type: Number,
        default: 0,
      },
      totalClicked: {
        type: Number,
        default: 0,
      },
      totalUnsubscribed: {
        type: Number,
        default: 0,
      },
    },
    settings: {
      timezone: {
        type: String,
        default: 'UTC',
      },
      sendTime: {
        type: String,
        default: '09:00',
      },
      respectUnsubscribe: {
        type: Boolean,
        default: true,
      },
      respectFrequencyCap: {
        type: Boolean,
        default: true,
      },
    },
    // Versioning / audit trail
    versions: [
      {
        version: { type: Number, required: true },
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        changes: { type: mongoose.Schema.Types.Mixed },
        createdAt: { type: Date, default: Date.now }
      }
    ],
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Automation', automationSchema);
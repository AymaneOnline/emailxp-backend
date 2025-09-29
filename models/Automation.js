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

// Log automation saves for debugging: id, isActive, and referenced templateIds
automationSchema.pre('save', function(next) {
  try {
    const doc = this;
    const nodes = doc.nodes || [];
    const nodeTemplates = nodes.map(n => n?.data?.config?.templateId || n?.data?.templateId || n?.templateId || null).filter(Boolean);

    // Extract trigger nodes
    const triggers = nodes.filter(n => (n?.type === 'trigger' || n?.data?.type === 'trigger' || n?.data?.event)).map(t => ({ id: t.id || t._id || null, event: t?.data?.event || t?.data?.type || null, conditions: t?.data?.conditions || t?.conditions || [] }));

    // Extract action nodes (send_template etc.)
    const actions = nodes.filter(n => {
      const actionType = n?.data?.type || n?.type || n?.nodeType || null;
      return actionType && (actionType === 'send_template' || actionType === 'send-email' || actionType === 'send_email' || actionType === 'action');
    }).map(a => ({ id: a.id || a._id || null, type: a?.data?.type || a?.type || a?.nodeType || null, templateId: a?.data?.config?.templateId || a?.data?.templateId || a?.config?.templateId || null }));

    console.log('[Automation Model] saving automation', { id: doc._id ? doc._id.toString() : null, isActive: !!doc.isActive, templates: nodeTemplates, triggers, actions });
  } catch (e) {
    console.warn('[Automation Model] failed to log automation pre-save', e && e.message ? e.message : e);
  }
  next();
});

module.exports = mongoose.model('Automation', automationSchema);
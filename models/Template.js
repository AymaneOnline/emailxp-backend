// emailxp/backend/models/Template.js

const mongoose = require('mongoose');

const templateSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: function() {
      return this.type !== 'system';
    }
  },
  name: {
    type: String,
    required: [true, 'Template name is required'],
    trim: true,
    maxlength: [100, 'Template name cannot exceed 100 characters']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  category: {
    type: String,
    enum: ['newsletter', 'promotional', 'transactional', 'welcome', 'announcement', 'custom'],
    default: 'custom'
  },
  type: {
    type: String,
    enum: ['user', 'system', 'shared'],
    default: 'user'
  },
  // Template content structure for drag-and-drop editor
  structure: {
    type: Object,
    default: {
      blocks: [],
      settings: {
        backgroundColor: '#f4f4f4',
        contentWidth: 600,
        fontFamily: 'Arial, sans-serif',
        fontSize: 14,
        lineHeight: 1.5,
        textColor: '#333333'
      }
    }
  },
  // Generated HTML content
  htmlContent: {
    type: String,
    required: false // Will be generated from structure
  },
  // Plain text version
  plainTextContent: {
    type: String
  },
  // Template thumbnail/preview image
  thumbnail: {
    type: String // URL to thumbnail image
  },
  // Template tags for organization
  tags: [{
    type: String,
    trim: true
  }],
  // Usage statistics
  stats: {
    timesUsed: {
      type: Number,
      default: 0
    },
    lastUsed: {
      type: Date
    }
  },
  // Sharing and collaboration
  sharing: {
    isShared: { type: Boolean, default: false },
    sharedWith: [{
      user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      email: String,
      permissions: { 
        type: String, 
        enum: ['view', 'edit', 'admin'], 
        default: 'view' 
      },
      sharedAt: { type: Date, default: Date.now }
    }],
    lastShared: Date,
    madePublicAt: Date
  },
  // Template status
  isActive: {
    type: Boolean,
    default: true
  },
  isPublic: {
    type: Boolean,
    default: false
  },
  // Version control
  version: {
    type: Number,
    default: 1
  },
  parentTemplate: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Template'
  }
}, {
  timestamps: true
});

// Indexes for better performance
templateSchema.index({ user: 1, isActive: 1 });
templateSchema.index({ category: 1, type: 1 });
templateSchema.index({ tags: 1 });
templateSchema.index({ 'stats.timesUsed': -1 });

// Virtual for template usage
templateSchema.virtual('isPopular').get(function() {
  return this.stats.timesUsed > 10;
});

// Method to increment usage stats
templateSchema.methods.incrementUsage = function() {
  this.stats.timesUsed += 1;
  this.stats.lastUsed = new Date();
  return this.save();
};

// Method to generate HTML from structure
templateSchema.methods.generateHTML = function() {
  const { blocks, settings } = this.structure;
  
  let html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${this.name}</title>
      <style>
        body {
          margin: 0;
          padding: 0;
          background-color: ${settings.backgroundColor || '#f4f4f4'};
          font-family: ${settings.fontFamily || 'Arial, sans-serif'};
          font-size: ${settings.fontSize || 14}px;
          line-height: ${settings.lineHeight || 1.5};
          color: ${settings.textColor || '#333333'};
        }
        .email-container {
          max-width: ${settings.contentWidth || 600}px;
          margin: 0 auto;
          background-color: #ffffff;
        }
        .block {
          padding: 20px;
        }
        .text-block {
          padding: 15px 20px;
        }
        .image-block {
          text-align: center;
          padding: 10px 20px;
        }
        .image-block img {
          max-width: 100%;
          height: auto;
        }
        .button-block {
          text-align: center;
          padding: 20px;
        }
        .button {
          display: inline-block;
          padding: 12px 24px;
          background-color: #007bff;
          color: #ffffff;
          text-decoration: none;
          border-radius: 4px;
          font-weight: bold;
        }
        .divider-block {
          padding: 10px 20px;
        }
        .divider {
          height: 1px;
          background-color: #e0e0e0;
          margin: 10px 0;
        }
        .spacer-block {
          height: 20px;
        }
        @media only screen and (max-width: 600px) {
          .email-container {
            width: 100% !important;
          }
          .block {
            padding: 15px !important;
          }
        }
      </style>
    </head>
    <body>
      <div class="email-container">
  `;

  // Generate HTML for each block
  blocks.forEach(block => {
    switch (block.type) {
      case 'text':
        html += `
          <div class="text-block block" style="${block.styles || ''}">
            ${block.content || ''}
          </div>
        `;
        break;
      
      case 'image':
        html += `
          <div class="image-block block" style="${block.styles || ''}">
            <img src="${block.src || ''}" alt="${block.alt || ''}" style="max-width: 100%; height: auto;">
          </div>
        `;
        break;
      
      case 'button':
        html += `
          <div class="button-block block" style="${block.styles || ''}">
            <a href="${block.href || '#'}" class="button" style="background-color: ${block.backgroundColor || '#007bff'}; color: ${block.textColor || '#ffffff'};">
              ${block.text || 'Click Here'}
            </a>
          </div>
        `;
        break;
      
      case 'divider':
        html += `
          <div class="divider-block block">
            <div class="divider" style="background-color: ${block.color || '#e0e0e0'}; height: ${block.height || 1}px;"></div>
          </div>
        `;
        break;
      
      case 'spacer':
        html += `
          <div class="spacer-block" style="height: ${block.height || 20}px;"></div>
        `;
        break;
      
      case 'columns':
        html += `
          <div class="columns-block block" style="${block.styles || ''}">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                ${block.columns?.map(column => `
                  <td width="${column.width}" valign="top" style="padding: 0 10px;">
                    ${column.content || ''}
                  </td>
                `).join('') || ''}
              </tr>
            </table>
          </div>
        `;
        break;
      
      case 'social':
        html += `
          <div class="social-block block" style="${block.styles || ''}">
            ${block.links?.map(link => `
              <a href="${link.url || '#'}" style="display: inline-block; margin: 0 10px; text-decoration: none; font-size: 24px;">
                ${link.icon || '🔗'}
              </a>
            `).join('') || ''}
          </div>
        `;
        break;
      
      default:
        html += `<div class="block">${block.content || ''}</div>`;
    }
  });

  html += `
      </div>
    </body>
    </html>
  `;

  return html;
};

// Method to generate plain text from structure
templateSchema.methods.generatePlainText = function() {
  const { blocks } = this.structure;
  let text = '';
  
  blocks.forEach(block => {
    switch (block.type) {
      case 'text':
        text += (block.content || '').replace(/<[^>]*>/g, '') + '\n\n';
        break;
      case 'button':
        text += `${block.text || 'Click Here'}: ${block.href || '#'}\n\n`;
        break;
      case 'divider':
        text += '---\n\n';
        break;
      case 'spacer':
        text += '\n';
        break;
    }
  });
  
  return text.trim();
};

// Pre-save middleware to generate HTML and plain text
templateSchema.pre('save', function(next) {
  if (this.isModified('structure')) {
    this.htmlContent = this.generateHTML();
    this.plainTextContent = this.generatePlainText();
  }
  next();
});

// Static method to get popular templates
templateSchema.statics.getPopular = function(limit = 10) {
  return this.find({ isActive: true, type: { $in: ['system', 'shared'] } })
    .sort({ 'stats.timesUsed': -1 })
    .limit(limit);
};

// Static method to get templates by category
templateSchema.statics.getByCategory = function(category, userId = null) {
  const query = { category, isActive: true };
  if (userId) {
    query.$or = [
      { user: userId },
      { type: { $in: ['system', 'shared'] } }
    ];
  } else {
    query.type = { $in: ['system', 'shared'] };
  }
  return this.find(query).sort({ 'stats.timesUsed': -1, createdAt: -1 });
};

module.exports = mongoose.model('Template', templateSchema);
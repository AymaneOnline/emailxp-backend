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
        textColor: '#333333',
        linkColor: '#007cba',
        preheader: ''
      }
    }
  },
  // Generated HTML content
  htmlContent: {
    type: String,
    required: false // Will be generated from structure
  },
  // Unlayer design object for email editor
  emailDesign: {
    type: Object,
    default: null
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

// Utility: safely serialize style objects to inline CSS
function styleObjectToString(styleObj) {
  if (!styleObj || typeof styleObj !== 'object') return '';
  return Object.entries(styleObj)
    .filter(([k, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => {
      const key = k.replace(/[A-Z]/g, m => '-' + m.toLowerCase()); // camelCase -> kebab-case
      const needsPx = typeof v === 'number' && !key.includes('color') && !key.includes('opacity') && !key.includes('z-index') && !key.includes('font-weight') && !key.includes('line-height');
      return `${key}: ${v}${needsPx ? 'px' : ''};`;
    })
    .join(' ');
}

// Method to generate HTML from structure
templateSchema.methods.generateHTML = function() {
  const { blocks = [], settings = {} } = this.structure || {};
  const backgroundColor = settings.backgroundColor || '#f4f4f4';
  const contentWidth = settings.contentWidth || 600;
  const fontFamily = settings.fontFamily || 'Arial, sans-serif';
  const fontSize = settings.fontSize || 14;
  const lineHeight = settings.lineHeight || 1.5;
  const textColor = settings.textColor || '#333333';
  const linkColor = settings.linkColor || '#007cba';
  const preheader = settings.preheader || '';
  
  let html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${this.name}</title>
      <style>
        body { margin: 0; padding: 0; background-color: ${backgroundColor}; font-family: ${fontFamily}; font-size: ${fontSize}px; line-height: ${lineHeight}; color: ${textColor}; }
        a { color: ${linkColor}; }
        .email-container { max-width: ${contentWidth}px; margin: 0 auto; background-color: #ffffff; }
        .block { padding: 20px; }
        .text-block { padding: 15px 20px; }
        .image-block { text-align: center; padding: 10px 20px; }
        .image-block img { max-width: 100%; height: auto; }
        .button-block { text-align: center; padding: 20px; }
        .button { display: inline-block; padding: 12px 24px; background-color: ${linkColor}; color: #ffffff; text-decoration: none; border-radius: 4px; font-weight: bold; }
        .divider-block { padding: 10px 20px; }
        .divider { height: 1px; background-color: #e0e0e0; margin: 10px 0; }
        .spacer-block { height: 20px; }
        @media only screen and (max-width: 600px) { .email-container { width: 100% !important; } .block { padding: 15px !important; } }
      </style>
    </head>
    <body>
      ${preheader ? `<div style="display:none; max-height:0; overflow:hidden; opacity:0;">${preheader}</div>` : ''}
      <div class="email-container">
  `;

  // Generate HTML for each block
  blocks.forEach(block => {
    const stylesStr = styleObjectToString(block.styles || {});
    switch (block.type) {
      case 'text': {
        const text = block.content?.text ?? block.content ?? '';
        html += `
          <div class="text-block block" style="${stylesStr}">
            ${text}
          </div>
        `;
        break;
      }
      case 'heading': {
        const level = block.content?.level || 'h2';
        const text = block.content?.text || '';
        html += `<${level} class="block" style="${stylesStr}">${text}</${level}>`;
        break;
      }
      case 'image': {
        const src = block.content?.src ?? block.src ?? '';
        const alt = block.content?.alt ?? block.alt ?? '';
        html += `
          <div class="image-block block" style="${stylesStr}">
            <img src="${src}" alt="${alt}" style="max-width: 100%; height: auto;" />
          </div>
        `;
        break;
      }
      case 'button': {
        const text = block.content?.text ?? block.text ?? 'Click Here';
        const href = block.content?.link ?? block.href ?? '#';
        const bg = (block.styles && block.styles.backgroundColor) || linkColor;
        const color = (block.styles && block.styles.color) || '#ffffff';
        html += `
          <div class="button-block block" style="text-align: ${block.content?.align || 'center'}; ${stylesStr}">
            <a href="${href}" class="button" style="background-color: ${bg}; color: ${color};">${text}</a>
          </div>
        `;
        break;
      }
      case 'divider': {
        const color = block.content?.color || block.color || '#e0e0e0';
        const height = block.content?.height || block.height || 1;
        html += `
          <div class="divider-block block">
            <div class="divider" style="background-color: ${color}; height: ${height}px;"></div>
          </div>
        `;
        break;
      }
      case 'spacer': {
        const height = block.content?.height || block.height || 20;
        html += `<div class="spacer-block" style="height: ${height}px;"></div>`;
        break;
      }
      case 'social': {
        const links = block.content?.links || block.links || [];
        const align = block.content?.align || 'center';
        html += `
          <div class="social-block block" style="text-align: ${align}; ${stylesStr}">
            ${links.map(link => `<a href="${link.url || '#'}" style="display: inline-block; margin: 0 10px; text-decoration: none; font-size: 24px;">🔗</a>`).join('')}
          </div>
        `;
        break;
      }
      case 'footer': {
        const text = block.content?.text || '';
        const align = block.content?.align || 'center';
        html += `<div class="block" style="text-align: ${align}; ${stylesStr}">${text}</div>`;
        break;
      }
      // Handle dynamic content blocks
      case 'dynamic': {
        // For dynamic content blocks, we'll add special markers that will be replaced during sending
        const conditions = block.conditions || [];
        const defaultContent = block.defaultContent || '';
        const variable = block.variable || 'name';
        
        // Create a container for dynamic content with data attributes for conditions
        html += `
          <div class="dynamic-content-block block" style="${stylesStr}" data-dynamic-content="${block.id}" data-variable="${variable}">
            <!-- Dynamic content will be personalized during send -->
            <div class="dynamic-default-content">${defaultContent}</div>
          </div>
        `;
        break;
      }
      default: {
        const content = block.content || '';
        html += `<div class="block" style="${stylesStr}">${content}</div>`;
      }
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
  const { blocks = [] } = this.structure || {};
  let text = '';
  
  blocks.forEach(block => {
    switch (block.type) {
      case 'text': {
        const t = (block.content?.text ?? block.content ?? '').toString();
        text += t.replace(/<[^>]*>/g, '') + '\n\n';
        break;
      }
      case 'button': {
        const label = block.content?.text ?? block.text ?? 'Click Here';
        const href = block.content?.link ?? block.href ?? '#';
        text += `${label}: ${href}\n\n`;
        break;
      }
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

// Pre-save middleware to normalize and generate HTML and plain text
templateSchema.pre('save', function(next) {
  try {
    if (this.isModified('structure')) {
      const structure = this.structure || {};
      const blocks = Array.isArray(structure.blocks) ? structure.blocks : [];
      // Normalize blocks to have content and styles objects
      structure.blocks = blocks.map(b => ({
        ...b,
        content: b && typeof b.content === 'object' ? b.content : (b?.content ? { text: b.content } : {}),
        styles: b && typeof b.styles === 'object' ? b.styles : {}
      }));
      this.structure = structure;

      this.htmlContent = this.generateHTML();
      this.plainTextContent = this.generatePlainText();
    }
    next();
  } catch (err) {
    next(err);
  }
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

// Compliance: ensure templates include a footer with unsubscribe link
templateSchema.methods.hasFooterAndUnsubscribe = function() {
  try {
    const blocks = (this.structure && this.structure.blocks) || [];
    const footer = blocks.find(b => b && b.type === 'footer');
    if (!footer) return false;
    const contentText = (footer.content?.text || '').toString();
    const hasToken = /\{\{\s*unsubscribeUrl\s*\}\}/i.test(contentText);
    const mentionsUnsub = contentText.toLowerCase().includes('unsubscribe');
    return hasToken && mentionsUnsub;
  } catch (e) {
    return false;
  }
};

// Enforce compliance before saving/validating
templateSchema.pre('validate', function(next) {
  if (!this.hasFooterAndUnsubscribe || !this.hasFooterAndUnsubscribe()) {
    return next(new Error('Template must include a footer block containing an unsubscribe link ({{unsubscribeUrl}}).'));
  }
  next();
});

module.exports = mongoose.model('Template', templateSchema);
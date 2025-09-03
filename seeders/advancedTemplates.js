// emailxp/backend/seeders/advancedTemplates.js

const Template = require('../models/Template');

const advancedTemplates = [
  {
    name: 'Product Launch',
    description: 'Professional template for product launches with hero image and features',
    category: 'promotional',
    type: 'system',
    structure: {
      blocks: [
        {
          id: '1',
          type: 'image',
          src: 'https://via.placeholder.com/600x300/007bff/ffffff?text=New+Product+Launch',
          alt: 'Product Launch',
          styles: 'text-align: center; padding: 0;'
        },
        {
          id: '2',
          type: 'text',
          content: '<h1 style="color: #333; text-align: center; margin: 0; font-size: 32px;">Introducing Our Latest Innovation</h1>',
          styles: 'padding: 40px 20px 20px;'
        },
        {
          id: '3',
          type: 'text',
          content: '<p style="color: #666; text-align: center; font-size: 18px; line-height: 1.6; margin: 0;">Experience the future with our groundbreaking new product designed to revolutionize your workflow.</p>',
          styles: 'padding: 0 20px 30px;'
        },
        {
          id: '4',
          type: 'columns',
          columns: [
            {
              content: '<h3 style="color: #333; margin: 0 0 10px 0;">🚀 Fast</h3><p style="color: #666; margin: 0; font-size: 14px;">Lightning-fast performance that saves you time</p>',
              width: '33.33%'
            },
            {
              content: '<h3 style="color: #333; margin: 0 0 10px 0;">🔒 Secure</h3><p style="color: #666; margin: 0; font-size: 14px;">Enterprise-grade security you can trust</p>',
              width: '33.33%'
            },
            {
              content: '<h3 style="color: #333; margin: 0 0 10px 0;">💡 Smart</h3><p style="color: #666; margin: 0; font-size: 14px;">AI-powered features that adapt to your needs</p>',
              width: '33.33%'
            }
          ],
          styles: 'padding: 30px 20px;'
        },
        {
          id: '5',
          type: 'button',
          text: 'Get Early Access',
          href: 'https://example.com/early-access',
          backgroundColor: '#007bff',
          textColor: '#ffffff',
          styles: 'text-align: center; padding: 30px;'
        },
        {
          id: '6',
          type: 'divider',
          color: '#e0e0e0',
          height: 1,
          styles: 'padding: 20px;'
        },
        {
          id: '7',
          type: 'text',
          content: '<p style="color: #999; font-size: 12px; text-align: center; margin: 0;">Limited time offer. Be among the first 100 users to get exclusive benefits.</p>',
          styles: 'padding: 0 20px 30px;'
        }
      ],
      settings: {
        backgroundColor: '#f8f9fa',
        contentWidth: 600,
        fontFamily: 'Arial, sans-serif',
        fontSize: 14,
        lineHeight: 1.5,
        textColor: '#333333'
      }
    },
    tags: ['product', 'launch', 'features'],
    isPublic: true,
    stats: { timesUsed: 15 }
  },
  {
    name: 'Event Invitation',
    description: 'Elegant template for event invitations and announcements',
    category: 'announcement',
    type: 'system',
    structure: {
      blocks: [
        {
          id: '1',
          type: 'text',
          content: '<h1 style="color: #2c3e50; text-align: center; margin: 0; font-family: Georgia, serif; font-size: 28px;">You\'re Invited!</h1>',
          styles: 'padding: 40px 20px 20px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white;'
        },
        {
          id: '2',
          type: 'text',
          content: '<h2 style="color: white; text-align: center; margin: 0; font-weight: normal; font-size: 20px;">Annual Tech Conference 2024</h2>',
          styles: 'padding: 0 20px 40px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);'
        },
        {
          id: '3',
          type: 'spacer',
          height: 30
        },
        {
          id: '4',
          type: 'columns',
          columns: [
            {
              content: '<h3 style="color: #333; margin: 0 0 10px 0; text-align: center;">📅 Date</h3><p style="color: #666; margin: 0; text-align: center;">March 15, 2024</p>',
              width: '50%'
            },
            {
              content: '<h3 style="color: #333; margin: 0 0 10px 0; text-align: center;">📍 Location</h3><p style="color: #666; margin: 0; text-align: center;">Tech Center, Downtown</p>',
              width: '50%'
            }
          ],
          styles: 'padding: 20px;'
        },
        {
          id: '5',
          type: 'text',
          content: '<p style="color: #666; line-height: 1.6; margin: 0; text-align: center;">Join industry leaders, innovators, and tech enthusiasts for a day of inspiring talks, networking, and hands-on workshops.</p>',
          styles: 'padding: 20px 20px 30px;'
        },
        {
          id: '6',
          type: 'button',
          text: 'Reserve Your Spot',
          href: 'https://example.com/register',
          backgroundColor: '#667eea',
          textColor: '#ffffff',
          styles: 'text-align: center; padding: 20px;'
        },
        {
          id: '7',
          type: 'text',
          content: '<p style="color: #999; font-size: 12px; text-align: center; margin: 0;">Limited seats available. RSVP by March 1st.</p>',
          styles: 'padding: 20px 20px 30px;'
        }
      ],
      settings: {
        backgroundColor: '#ffffff',
        contentWidth: 600,
        fontFamily: 'Arial, sans-serif',
        fontSize: 14,
        lineHeight: 1.5,
        textColor: '#333333'
      }
    },
    tags: ['event', 'invitation', 'conference'],
    isPublic: true,
    stats: { timesUsed: 22 }
  },
  {
    name: 'Company Newsletter',
    description: 'Professional newsletter template with multiple sections',
    category: 'newsletter',
    type: 'system',
    structure: {
      blocks: [
        {
          id: '1',
          type: 'text',
          content: '<h1 style="color: #2c3e50; margin: 0; border-bottom: 3px solid #3498db; padding-bottom: 10px;">Company Newsletter</h1><p style="color: #7f8c8d; margin: 5px 0 0 0; font-size: 12px;">March 2024 Edition</p>',
          styles: 'padding: 30px 20px 20px;'
        },
        {
          id: '2',
          type: 'text',
          content: '<h2 style="color: #2c3e50; margin: 0 0 15px 0; font-size: 20px;">📈 This Month\'s Highlights</h2><ul style="color: #666; margin: 0; padding-left: 20px; line-height: 1.8;"><li>Q1 revenue increased by 25%</li><li>Launched new customer portal</li><li>Welcomed 50 new team members</li><li>Opened office in Seattle</li></ul>',
          styles: 'padding: 20px;'
        },
        {
          id: '3',
          type: 'divider',
          color: '#ecf0f1',
          height: 2,
          styles: 'padding: 20px;'
        },
        {
          id: '4',
          type: 'text',
          content: '<h2 style="color: #2c3e50; margin: 0 0 15px 0; font-size: 20px;">🎯 Featured Article</h2><h3 style="color: #34495e; margin: 0 0 10px 0;">The Future of Remote Work</h3><p style="color: #666; line-height: 1.6; margin: 0;">As we continue to evolve our work practices, we\'re seeing incredible innovations in how teams collaborate across distances. Our latest research shows...</p>',
          styles: 'padding: 0 20px 20px;'
        },
        {
          id: '5',
          type: 'button',
          text: 'Read Full Article',
          href: 'https://example.com/article',
          backgroundColor: '#3498db',
          textColor: '#ffffff',
          styles: 'text-align: center; padding: 20px;'
        },
        {
          id: '6',
          type: 'columns',
          columns: [
            {
              content: '<h3 style="color: #2c3e50; margin: 0 0 10px 0; font-size: 16px;">🏆 Employee Spotlight</h3><p style="color: #666; margin: 0; font-size: 14px;">Congratulations to Sarah Johnson for leading our most successful product launch!</p>',
              width: '50%'
            },
            {
              content: '<h3 style="color: #2c3e50; margin: 0 0 10px 0; font-size: 16px;">📅 Upcoming Events</h3><p style="color: #666; margin: 0; font-size: 14px;">• Team Building Day - March 20<br>• Quarterly Review - March 25</p>',
              width: '50%'
            }
          ],
          styles: 'padding: 30px 20px;'
        },
        {
          id: '7',
          type: 'social',
          links: [
            { platform: 'linkedin', url: 'https://linkedin.com/company/example', icon: '💼' },
            { platform: 'twitter', url: 'https://twitter.com/example', icon: '🐦' },
            { platform: 'facebook', url: 'https://facebook.com/example', icon: '📘' }
          ],
          styles: 'text-align: center; padding: 30px 20px;'
        }
      ],
      settings: {
        backgroundColor: '#ffffff',
        contentWidth: 600,
        fontFamily: 'Arial, sans-serif',
        fontSize: 14,
        lineHeight: 1.5,
        textColor: '#333333'
      }
    },
    tags: ['newsletter', 'company', 'updates'],
    isPublic: true,
    stats: { timesUsed: 35 }
  }
];

const seedAdvancedTemplates = async () => {
  try {
    console.log('Seeding advanced templates...');
    
    // Create advanced templates
    for (const templateData of advancedTemplates) {
      const template = new Template({
        ...templateData,
        user: null,
        isActive: true
      });
      
      await template.save();
      console.log(`Created advanced template: ${template.name}`);
    }
    
    console.log(`Successfully seeded ${advancedTemplates.length} advanced templates`);
  } catch (error) {
    console.error('Error seeding advanced templates:', error);
  }
};

module.exports = { seedAdvancedTemplates, advancedTemplates };
// emailxp/backend/seeders/templateSeeder.js

const Template = require('../models/Template');

const systemTemplates = [
  {
    name: 'Welcome Email',
    description: 'A warm welcome message for new subscribers',
    category: 'welcome',
    type: 'system',
    structure: {
      blocks: [
        {
          id: '1',
          type: 'text',
          content: '<h1 style="color: #333; text-align: center; margin: 0;">Welcome to Our Community!</h1>',
          styles: 'padding: 30px 20px 20px;'
        },
        {
          id: '2',
          type: 'text',
          content: '<p style="color: #666; line-height: 1.6; margin: 0;">Thank you for joining us! We\'re excited to have you on board and can\'t wait to share amazing content with you.</p>',
          styles: 'padding: 0 20px 20px;'
        },
        {
          id: '3',
          type: 'button',
          text: 'Get Started',
          href: 'https://example.com/get-started',
          backgroundColor: '#007bff',
          textColor: '#ffffff',
          styles: 'text-align: center; padding: 20px;'
        },
        {
          id: '4',
          type: 'divider',
          color: '#e0e0e0',
          height: 1,
          styles: 'padding: 20px;'
        },
        {
          id: '5',
          type: 'text',
          content: '<p style="color: #999; font-size: 12px; text-align: center; margin: 0;">If you have any questions, feel free to reply to this email.</p>',
          styles: 'padding: 0 20px 20px;'
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
    tags: ['welcome', 'onboarding'],
    isPublic: true,
    stats: { timesUsed: 25 }
  },
  {
    name: 'Newsletter Template',
    description: 'Clean and professional newsletter layout',
    category: 'newsletter',
    type: 'system',
    structure: {
      blocks: [
        {
          id: '1',
          type: 'text',
          content: '<h1 style="color: #333; margin: 0;">Weekly Newsletter</h1>',
          styles: 'padding: 30px 20px 10px;'
        },
        {
          id: '2',
          type: 'text',
          content: '<p style="color: #666; margin: 0;">Stay updated with our latest news and insights</p>',
          styles: 'padding: 0 20px 30px;'
        },
        {
          id: '3',
          type: 'text',
          content: '<h2 style="color: #333; margin: 0 0 10px 0;">Featured Article</h2><p style="color: #666; line-height: 1.6; margin: 0;">Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.</p>',
          styles: 'padding: 0 20px 20px;'
        },
        {
          id: '4',
          type: 'button',
          text: 'Read More',
          href: 'https://example.com/article',
          backgroundColor: '#28a745',
          textColor: '#ffffff',
          styles: 'text-align: center; padding: 20px;'
        },
        {
          id: '5',
          type: 'divider',
          color: '#e0e0e0',
          height: 1,
          styles: 'padding: 30px 20px;'
        },
        {
          id: '6',
          type: 'text',
          content: '<h3 style="color: #333; margin: 0 0 15px 0;">Quick Updates</h3><ul style="color: #666; margin: 0; padding-left: 20px;"><li>Update 1: New feature released</li><li>Update 2: Upcoming webinar</li><li>Update 3: Community highlights</li></ul>',
          styles: 'padding: 0 20px 30px;'
        }
      ],
      settings: {
        backgroundColor: '#ffffff',
        contentWidth: 600,
        fontFamily: 'Georgia, serif',
        fontSize: 14,
        lineHeight: 1.6,
        textColor: '#333333'
      }
    },
    tags: ['newsletter', 'updates'],
    isPublic: true,
    stats: { timesUsed: 42 }
  },
  {
    name: 'Promotional Sale',
    description: 'Eye-catching template for sales and promotions',
    category: 'promotional',
    type: 'system',
    structure: {
      blocks: [
        {
          id: '1',
          type: 'text',
          content: '<h1 style="color: #dc3545; text-align: center; margin: 0; font-size: 28px;">🔥 FLASH SALE 🔥</h1>',
          styles: 'padding: 30px 20px 10px; background-color: #fff3cd;'
        },
        {
          id: '2',
          type: 'text',
          content: '<p style="color: #333; text-align: center; font-size: 18px; margin: 0;"><strong>50% OFF Everything!</strong></p>',
          styles: 'padding: 0 20px 20px; background-color: #fff3cd;'
        },
        {
          id: '3',
          type: 'text',
          content: '<p style="color: #666; text-align: center; margin: 0;">Limited time offer - Don\'t miss out on these incredible savings!</p>',
          styles: 'padding: 20px;'
        },
        {
          id: '4',
          type: 'button',
          text: 'Shop Now',
          href: 'https://example.com/sale',
          backgroundColor: '#dc3545',
          textColor: '#ffffff',
          styles: 'text-align: center; padding: 30px;'
        },
        {
          id: '5',
          type: 'text',
          content: '<p style="color: #999; font-size: 12px; text-align: center; margin: 0;">Offer valid until midnight. Terms and conditions apply.</p>',
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
    tags: ['sale', 'promotion', 'discount'],
    isPublic: true,
    stats: { timesUsed: 18 }
  },
  {
    name: 'Simple Announcement',
    description: 'Clean template for important announcements',
    category: 'announcement',
    type: 'system',
    structure: {
      blocks: [
        {
          id: '1',
          type: 'text',
          content: '<h1 style="color: #333; text-align: center; margin: 0;">Important Announcement</h1>',
          styles: 'padding: 40px 20px 20px;'
        },
        {
          id: '2',
          type: 'text',
          content: '<p style="color: #666; line-height: 1.6; margin: 0;">We have some exciting news to share with you. Our team has been working hard to bring you new features and improvements.</p>',
          styles: 'padding: 0 20px 30px;'
        },
        {
          id: '3',
          type: 'text',
          content: '<p style="color: #666; line-height: 1.6; margin: 0;">Here\'s what\'s new:</p><ul style="color: #666; margin: 10px 0 0 0; padding-left: 20px;"><li>Feature 1: Enhanced user experience</li><li>Feature 2: Improved performance</li><li>Feature 3: New integrations</li></ul>',
          styles: 'padding: 0 20px 30px;'
        },
        {
          id: '4',
          type: 'button',
          text: 'Learn More',
          href: 'https://example.com/updates',
          backgroundColor: '#6c757d',
          textColor: '#ffffff',
          styles: 'text-align: center; padding: 20px;'
        },
        {
          id: '5',
          type: 'spacer',
          height: 30
        },
        {
          id: '6',
          type: 'text',
          content: '<p style="color: #999; font-size: 12px; text-align: center; margin: 0;">Thank you for being part of our community!</p>',
          styles: 'padding: 0 20px 30px;'
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
    tags: ['announcement', 'news'],
    isPublic: true,
    stats: { timesUsed: 12 }
  },
  {
    name: 'Order Confirmation',
    description: 'Professional template for order confirmations',
    category: 'transactional',
    type: 'system',
    structure: {
      blocks: [
        {
          id: '1',
          type: 'text',
          content: '<h1 style="color: #28a745; text-align: center; margin: 0;">Order Confirmed! ✓</h1>',
          styles: 'padding: 30px 20px 20px;'
        },
        {
          id: '2',
          type: 'text',
          content: '<p style="color: #666; text-align: center; margin: 0;">Thank you for your purchase. Your order has been confirmed and is being processed.</p>',
          styles: 'padding: 0 20px 30px;'
        },
        {
          id: '3',
          type: 'text',
          content: '<div style="background-color: #f8f9fa; padding: 20px; margin: 0 20px;"><h3 style="color: #333; margin: 0 0 15px 0;">Order Details</h3><p style="margin: 5px 0; color: #666;"><strong>Order #:</strong> 12345</p><p style="margin: 5px 0; color: #666;"><strong>Date:</strong> March 15, 2024</p><p style="margin: 5px 0; color: #666;"><strong>Total:</strong> $99.99</p></div>',
          styles: 'padding: 0 0 30px 0;'
        },
        {
          id: '4',
          type: 'button',
          text: 'Track Your Order',
          href: 'https://example.com/track',
          backgroundColor: '#007bff',
          textColor: '#ffffff',
          styles: 'text-align: center; padding: 20px;'
        },
        {
          id: '5',
          type: 'divider',
          color: '#e0e0e0',
          height: 1,
          styles: 'padding: 30px 20px;'
        },
        {
          id: '6',
          type: 'text',
          content: '<p style="color: #999; font-size: 12px; text-align: center; margin: 0;">Questions? Contact our support team at support@example.com</p>',
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
    tags: ['order', 'confirmation', 'transactional'],
    isPublic: true,
    stats: { timesUsed: 8 }
  }
];

const seedTemplates = async () => {
  try {
    console.log('Seeding system templates...');
    
    // Remove existing system templates
    await Template.deleteMany({ type: 'system' });
    
    // Create new system templates
    for (const templateData of systemTemplates) {
      const template = new Template({
        ...templateData,
        user: null, // System templates don't belong to a specific user
        isActive: true
      });
      
      await template.save();
      console.log(`Created template: ${template.name}`);
    }
    
    console.log(`Successfully seeded ${systemTemplates.length} system templates`);
  } catch (error) {
    console.error('Error seeding templates:', error);
  }
};

module.exports = { seedTemplates, systemTemplates };
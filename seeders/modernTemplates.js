// emailxp/backend/seeders/modernTemplates.js

const Template = require('../models/Template');

const modernTemplates = [
  {
    name: 'Welcome Newsletter',
    description: 'Modern welcome email with gradient header and clean design',
    category: 'welcome',
    type: 'system',
    structure: {
      blocks: [
        {
          id: 'header-1',
          type: 'text',
          content: {
            text: '<div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 20px; text-align: center; color: white;"><h1 style="margin: 0; font-size: 32px; font-weight: bold;">Welcome to Our Community!</h1><p style="margin: 15px 0 0 0; font-size: 18px; opacity: 0.9;">We\'re thrilled to have you on board</p></div>'
          },
          styles: {
            padding: '0',
            margin: '0'
          }
        },
        {
          id: 'content-1',
          type: 'text',
          content: {
            text: '<h2 style="color: #333; font-size: 24px; margin-bottom: 15px;">Getting Started is Easy</h2><p style="color: #666; font-size: 16px; line-height: 1.6; margin-bottom: 20px;">Thank you for joining our newsletter! You\'ll receive exclusive content, insider tips, and be the first to know about our latest updates and offers.</p><p style="color: #666; font-size: 16px; line-height: 1.6;">Here\'s what you can expect:</p><ul style="color: #666; font-size: 16px; line-height: 1.6; padding-left: 20px;"><li>Weekly insights and industry news</li><li>Exclusive discounts and early access</li><li>Expert tips and tutorials</li></ul>'
          },
          styles: {
            padding: '40px 30px 20px 30px'
          }
        },
        {
          id: 'button-1',
          type: 'button',
          content: {
            text: 'Explore Our Platform',
            link: 'https://example.com/dashboard',
            align: 'center'
          },
          styles: {
            backgroundColor: '#667eea',
            color: '#ffffff',
            fontSize: '16px',
            fontWeight: 'bold',
            padding: '15px 30px',
            borderRadius: '8px',
            textDecoration: 'none',
            display: 'inline-block',
            margin: '20px 0'
          }
        },
        {
          id: 'social-1',
          type: 'social',
          content: {
            links: [
              { platform: 'facebook', url: 'https://facebook.com/yourcompany' },
              { platform: 'twitter', url: 'https://twitter.com/yourcompany' },
              { platform: 'linkedin', url: 'https://linkedin.com/company/yourcompany' }
            ],
            align: 'center'
          },
          styles: {
            padding: '30px 30px 20px 30px'
          }
        },
        {
          id: 'footer-1',
          type: 'footer',
          content: {
            text: 'You\'re receiving this email because you subscribed to our newsletter. <br><br>© 2024 Your Company Name. All rights reserved.<br><a href="{{unsubscribeUrl}}" style="color: #667eea;">Unsubscribe</a> | <a href="#" style="color: #667eea;">Update Preferences</a>',
            align: 'center'
          },
          styles: {
            fontSize: '12px',
            color: '#999999',
            padding: '30px',
            borderTop: '1px solid #eeeeee',
            lineHeight: '1.5'
          }
        }
      ],
      settings: {
        backgroundColor: '#f8f9fa',
        contentWidth: 600,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        fontSize: 16,
        lineHeight: 1.6,
        textColor: '#333333',
        linkColor: '#667eea',
        preheader: 'Welcome to our community! Let\'s get you started.'
      }
    },
    tags: ['welcome', 'onboarding', 'modern'],
    isPublic: true,
    stats: { timesUsed: 0 }
  },
  
  {
    name: 'Product Launch',
    description: 'Eye-catching product launch email with hero section and features',
    category: 'promotional',
    type: 'system',
    structure: {
      blocks: [
        {
          id: 'hero-1',
          type: 'image',
          content: {
            src: 'https://images.unsplash.com/photo-1560472354-b33ff0c44a43?w=600&h=300&fit=crop',
            alt: 'New Product Launch',
            width: '100%',
            link: ''
          },
          styles: {
            padding: '0',
            textAlign: 'center'
          }
        },
        {
          id: 'announcement-1',
          type: 'text',
          content: {
            text: '<div style="background: #000; color: white; padding: 30px; text-align: center;"><h1 style="margin: 0; font-size: 36px; font-weight: bold; letter-spacing: -1px;">INTRODUCING</h1><h2 style="margin: 10px 0 0 0; font-size: 28px; font-weight: 300; color: #ffd700;">The Next Generation</h2></div>'
          },
          styles: {
            padding: '0',
            margin: '0'
          }
        },
        {
          id: 'description-1',
          type: 'text',
          content: {
            text: '<h2 style="color: #333; font-size: 26px; text-align: center; margin-bottom: 20px;">Revolutionary Innovation</h2><p style="color: #666; font-size: 18px; line-height: 1.6; text-align: center; margin-bottom: 30px;">Experience the future with our groundbreaking new product that combines cutting-edge technology with elegant design.</p>'
          },
          styles: {
            padding: '40px 30px 20px 30px'
          }
        },
        {
          id: 'features-1',
          type: 'text',
          content: {
            text: '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 30px; margin: 30px 0;"><div style="text-align: center; padding: 20px;"><div style="background: #667eea; color: white; width: 60px; height: 60px; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 15px; font-size: 24px;">⚡</div><h3 style="color: #333; font-size: 18px; margin-bottom: 10px;">Lightning Fast</h3><p style="color: #666; font-size: 14px; line-height: 1.5;">Incredibly fast performance that exceeds expectations</p></div><div style="text-align: center; padding: 20px;"><div style="background: #764ba2; color: white; width: 60px; height: 60px; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 15px; font-size: 24px;">🎯</div><h3 style="color: #333; font-size: 18px; margin-bottom: 10px;">Precision Design</h3><p style="color: #666; font-size: 14px; line-height: 1.5;">Meticulously crafted for the perfect user experience</p></div></div>'
          },
          styles: {
            padding: '0 30px'
          }
        },
        {
          id: 'cta-section-1',
          type: 'text',
          content: {
            text: '<div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px; text-align: center; margin: 30px 0;"><h3 style="color: white; font-size: 24px; margin-bottom: 15px;">Limited Time Offer</h3><p style="color: white; opacity: 0.9; margin-bottom: 25px; font-size: 16px;">Be among the first 100 customers and get 30% off!</p></div>'
          },
          styles: {
            padding: '0 30px'
          }
        },
        {
          id: 'button-1',
          type: 'button',
          content: {
            text: 'Pre-Order Now',
            link: 'https://example.com/preorder',
            align: 'center'
          },
          styles: {
            backgroundColor: '#ffd700',
            color: '#000000',
            fontSize: '18px',
            fontWeight: 'bold',
            padding: '18px 40px',
            borderRadius: '50px',
            textDecoration: 'none',
            display: 'inline-block',
            margin: '20px 0',
            boxShadow: '0 4px 15px rgba(255, 215, 0, 0.3)'
          }
        },
        {
          id: 'footer-1',
          type: 'footer',
          content: {
            text: 'Thank you for your interest in our products. <br><br>© 2024 Your Company Name. All rights reserved.<br><a href="{{unsubscribeUrl}}" style="color: #667eea;">Unsubscribe</a> | <a href="#" style="color: #667eea;">Contact Us</a>',
            align: 'center'
          },
          styles: {
            fontSize: '12px',
            color: '#999999',
            padding: '40px 30px',
            borderTop: '1px solid #eeeeee',
            lineHeight: '1.5'
          }
        }
      ],
      settings: {
        backgroundColor: '#ffffff',
        contentWidth: 600,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        fontSize: 16,
        lineHeight: 1.6,
        textColor: '#333333',
        linkColor: '#667eea',
        preheader: 'Introducing our revolutionary new product - limited time offer!'
      }
    },
    tags: ['product', 'launch', 'promotional', 'modern'],
    isPublic: true,
    stats: { timesUsed: 0 }
  },

  {
    name: 'Monthly Newsletter',
    description: 'Clean and professional monthly newsletter template',
    category: 'newsletter',
    type: 'system',
    structure: {
      blocks: [
        {
          id: 'header-1',
          type: 'text',
          content: {
            text: '<div style="border-bottom: 3px solid #667eea; padding: 30px 0; text-align: center;"><h1 style="margin: 0; font-size: 28px; color: #333; font-weight: 300;">Monthly Update</h1><p style="margin: 10px 0 0 0; color: #666; font-size: 14px; text-transform: uppercase; letter-spacing: 1px;">January 2024 Edition</p></div>'
          },
          styles: {
            padding: '0 30px'
          }
        },
        {
          id: 'intro-1',
          type: 'text',
          content: {
            text: '<h2 style="color: #333; font-size: 22px; margin-bottom: 15px;">What\'s New This Month</h2><p style="color: #666; font-size: 16px; line-height: 1.6; margin-bottom: 25px;">Hello there! Welcome to our monthly newsletter. This month we\'re excited to share some incredible updates, new features, and insights from our team.</p>'
          },
          styles: {
            padding: '40px 30px 20px 30px'
          }
        },
        {
          id: 'articles-1',
          type: 'text',
          content: {
            text: '<div style="border: 1px solid #eee; border-radius: 8px; padding: 25px; margin-bottom: 25px;"><h3 style="color: #333; font-size: 18px; margin-bottom: 10px;">📊 Industry Insights</h3><p style="color: #666; font-size: 15px; line-height: 1.5; margin-bottom: 15px;">Discover the latest trends and statistics that are shaping our industry this quarter.</p><a href="#" style="color: #667eea; font-size: 14px; text-decoration: none; font-weight: 500;">Read More →</a></div><div style="border: 1px solid #eee; border-radius: 8px; padding: 25px; margin-bottom: 25px;"><h3 style="color: #333; font-size: 18px; margin-bottom: 10px;">🚀 New Features</h3><p style="color: #666; font-size: 15px; line-height: 1.5; margin-bottom: 15px;">We\'ve launched some exciting new features that will help you be more productive.</p><a href="#" style="color: #667eea; font-size: 14px; text-decoration: none; font-weight: 500;">Learn More →</a></div><div style="border: 1px solid #eee; border-radius: 8px; padding: 25px;"><h3 style="color: #333; font-size: 18px; margin-bottom: 10px;">💡 Tips & Tricks</h3><p style="color: #666; font-size: 15px; line-height: 1.5; margin-bottom: 15px;">Expert tips from our team to help you get the most out of our platform.</p><a href="#" style="color: #667eea; font-size: 14px; text-decoration: none; font-weight: 500;">View Tips →</a></div>'
          },
          styles: {
            padding: '0 30px'
          }
        },
        {
          id: 'quote-1',
          type: 'text',
          content: {
            text: '<div style="background: #f8f9fa; padding: 30px; border-left: 4px solid #667eea; margin: 30px 0; font-style: italic;"><p style="color: #555; font-size: 16px; line-height: 1.6; margin: 0;">"Innovation distinguishes between a leader and a follower."</p><p style="color: #999; font-size: 14px; margin: 10px 0 0 0; text-align: right;">- Steve Jobs</p></div>'
          },
          styles: {
            padding: '0 30px'
          }
        },
        {
          id: 'button-1',
          type: 'button',
          content: {
            text: 'Visit Our Blog',
            link: 'https://example.com/blog',
            align: 'center'
          },
          styles: {
            backgroundColor: '#667eea',
            color: '#ffffff',
            fontSize: '16px',
            fontWeight: '500',
            padding: '12px 24px',
            borderRadius: '6px',
            textDecoration: 'none',
            display: 'inline-block',
            margin: '25px 0'
          }
        },
        {
          id: 'footer-1',
          type: 'footer',
          content: {
            text: 'Thanks for reading our monthly newsletter! <br><br>Best regards,<br>The Team<br><br>© 2024 Your Company Name. All rights reserved.<br><a href="{{unsubscribeUrl}}" style="color: #667eea;">Unsubscribe</a> | <a href="#" style="color: #667eea;">Archive</a>',
            align: 'center'
          },
          styles: {
            fontSize: '12px',
            color: '#999999',
            padding: '40px 30px',
            borderTop: '1px solid #eeeeee',
            lineHeight: '1.6'
          }
        }
      ],
      settings: {
        backgroundColor: '#ffffff',
        contentWidth: 600,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        fontSize: 16,
        lineHeight: 1.6,
        textColor: '#333333',
        linkColor: '#667eea',
        preheader: 'Your monthly update is here! New features, insights, and more.'
      }
    },
    tags: ['newsletter', 'monthly', 'professional', 'clean'],
    isPublic: true,
    stats: { timesUsed: 0 }
  }
];

const seedModernTemplates = async () => {
  try {
    console.log('Cleaning existing system templates...');
    
    // Remove all existing system templates
    await Template.deleteMany({ type: 'system' });
    console.log('Existing system templates removed');

    console.log('Seeding modern templates...');
    
    // Create new modern templates
    for (const templateData of modernTemplates) {
      const template = new Template({
        ...templateData,
        user: null, // System templates don't belong to a specific user
        isActive: true
      });
      
      await template.save();
      console.log(`✓ Created template: ${template.name}`);
    }
    
    console.log(`\n🎉 Successfully replaced old templates with ${modernTemplates.length} modern templates!`);
    console.log('Templates created:');
    modernTemplates.forEach((t, i) => {
      console.log(`  ${i + 1}. ${t.name} (${t.category})`);
    });
    
  } catch (error) {
    console.error('❌ Error seeding modern templates:', error);
    throw error;
  }
};

module.exports = { seedModernTemplates, modernTemplates };
// emailxp/backend/services/unlayerService.js

const axios = require('axios');

class UnlayerService {
  constructor() {
    this.apiKey = process.env.UNLAYER_API_KEY;
    this.projectId = process.env.UNLAYER_PROJECT_ID;
    this.baseURL = 'https://api.unlayer.com/v2';
    
    if (!this.apiKey) {
      console.warn('Unlayer API key not configured');
    }
    
    this.client = axios.create({
      baseURL: this.baseURL,
      headers: {
        'Authorization': `Basic ${Buffer.from(this.apiKey + ':').toString('base64')}`,
        'Content-Type': 'application/json'
      }
    });
  }

  // Get all templates from Unlayer
  async getTemplates(options = {}) {
    try {
      if (!this.apiKey) {
        throw new Error('Unlayer API key not configured');
      }

      const params = {
        project_id: this.projectId,
        limit: options.limit || 50,
        offset: options.offset || 0,
        ...options
      };

      const response = await this.client.get('/templates', { params });
      
      // Transform Unlayer templates to match frontend expectations
      const transformedTemplates = (response.data.data || []).map(template => ({
        id: template.id,
        name: template.name,
        description: template.description || `Unlayer template: ${template.name}`,
        category: template.category || 'welcome', // Default category if not provided
        thumbnail: template.thumbnail_url || template.thumbnail,
        design: template.design,
        created_at: template.created_at,
        updated_at: template.updated_at
      }));
      
      return {
        templates: transformedTemplates,
        total: response.data.total || 0,
        hasMore: response.data.has_more || false
      };
    } catch (error) {
      console.error('Error fetching templates from Unlayer:', error.message);
      throw new Error(`Failed to fetch templates: ${error.message}`);
    }
  }

  // Get template by ID
  async getTemplateById(templateId) {
    try {
      if (!this.apiKey) {
        throw new Error('Unlayer API key not configured');
      }

      const response = await this.client.get(`/templates/${templateId}`);
      
      // Transform single template to match frontend expectations
      const template = response.data.data;
      return {
        id: template.id,
        name: template.name,
        description: template.description || `Unlayer template: ${template.name}`,
        category: template.category || 'welcome',
        thumbnail: template.thumbnail_url || template.thumbnail,
        design: template.design,
        created_at: template.created_at,
        updated_at: template.updated_at
      };
    } catch (error) {
      console.error('Error fetching template by ID:', error.message);
      throw new Error(`Failed to fetch template: ${error.message}`);
    }
  }

  // Export template as HTML with enhanced error handling
  async exportTemplateAsHtml(templateId, options = {}) {
    try {
      if (!this.apiKey) {
        throw new Error('Unlayer API key not configured');
      }

      console.log(`Attempting to export template ${templateId} as HTML`);

      // Strategy 1: Try direct template export first
      try {
        const response = await this.client.post(`/templates/${templateId}/export`, {
          displayMode: 'email',
          ...options
        });
        
        console.log('Template export successful via template endpoint');
        return response.data.data || response.data;
      } catch (templateExportError) {
        console.warn('Template export failed, trying design approach:', templateExportError.message);
        
        // Strategy 2: Get template design and export via design endpoint
        const template = await this.getTemplateById(templateId);
        
        if (!template || !template.design) {
          throw new Error('Template or template design not found');
        }

        return await this.exportDesignAsHtml(template.design, options);
      }
    } catch (error) {
      console.error('Error exporting template as HTML:', error.message);
      if (error.response) {
        console.error('Error response data:', error.response.data);
        console.error('Error response status:', error.response.status);
        console.error('Error response headers:', error.response.headers);
      }
      throw new Error(`Failed to export template: ${error.message}`);
    }
  }

  // Enhanced export method using design directly
  async exportDesignAsHtml(design, options = {}) {
    try {
      if (!this.apiKey) {
        throw new Error('Unlayer API key not configured');
      }

      console.log('Attempting to export design as HTML');
      
      const response = await this.client.post('/export/html', {
        design: design,
        displayMode: 'email',
        ...options
      });

      console.log('Design export successful');
      return response.data.data || response.data;
    } catch (error) {
      console.error('Error exporting design as HTML:', error.message);
      if (error.response) {
        console.error('Error response data:', error.response.data);
        console.error('Error response status:', error.response.status);
        console.error('Error response headers:', error.response.headers);
      }
      throw new Error(`Failed to export design: ${error.message}`);
    }
  }

  // Get template categories (if available)
  async getCategories() {
    try {
      if (!this.apiKey) {
        // Return default categories if no API key
        return [
          { value: '', label: 'All Templates', description: 'Browse all available templates' },
          { value: 'newsletter', label: 'Newsletter', description: 'Regular updates and newsletters' },
          { value: 'promotional', label: 'Promotional', description: 'Sales and marketing campaigns' },
          { value: 'transactional', label: 'Transactional', description: 'Order confirmations and receipts' },
          { value: 'welcome', label: 'Welcome', description: 'Onboarding and welcome emails' },
          { value: 'announcement', label: 'Announcement', description: 'Product launches and updates' }
        ];
      }

      // Note: Unlayer API doesn't have a dedicated categories endpoint
      // We'll use predefined categories
      return [
        { value: '', label: 'All Templates', description: 'Browse all available templates' },
        { value: 'newsletter', label: 'Newsletter', description: 'Regular updates and newsletters' },
        { value: 'promotional', label: 'Promotional', description: 'Sales and marketing campaigns' },
        { value: 'transactional', label: 'Transactional', description: 'Order confirmations and receipts' },
        { value: 'welcome', label: 'Welcome', description: 'Onboarding and welcome emails' },
        { value: 'announcement', label: 'Announcement', description: 'Product launches and updates' }
      ];
    } catch (error) {
      console.error('Error fetching categories:', error.message);
      return [];
    }
  }

  // Create a new template
  async createTemplate(templateData) {
    try {
      if (!this.apiKey) {
        throw new Error('Unlayer API key not configured');
      }

      const response = await this.client.post('/templates', {
        project_id: this.projectId,
        ...templateData
      });

      return response.data.data;
    } catch (error) {
      console.error('Error creating template:', error.message);
      throw new Error(`Failed to create template: ${error.message}`);
    }
  }

  // Update an existing template
  async updateTemplate(templateId, templateData) {
    try {
      if (!this.apiKey) {
        throw new Error('Unlayer API key not configured');
      }

      const response = await this.client.put(`/templates/${templateId}`, templateData);
      return response.data.data;
    } catch (error) {
      console.error('Error updating template:', error.message);
      throw new Error(`Failed to update template: ${error.message}`);
    }
  }

  // Delete a template
  async deleteTemplate(templateId) {
    try {
      if (!this.apiKey) {
        throw new Error('Unlayer API key not configured');
      }

      await this.client.delete(`/templates/${templateId}`);
      return { success: true };
    } catch (error) {
      console.error('Error deleting template:', error.message);
      throw new Error(`Failed to delete template: ${error.message}`);
    }
  }

  // Export design as image
  async exportDesignAsImage(design, options = {}) {
    try {
      if (!this.apiKey) {
        throw new Error('Unlayer API key not configured');
      }

      console.log('Attempting to export design as image');
      
      const response = await this.client.post('/export/image', {
        design: design,
        displayMode: 'email',
        ...options
      });

      console.log('Design image export successful');
      // According to Unlayer API docs, response should be { success: true, data: { url: "..." } }
      return response.data;
    } catch (error) {
      console.error('Error exporting design as image:', error.message);
      if (error.response) {
        console.error('Error response data:', error.response.data);
        console.error('Error response status:', error.response.status);
        console.error('Error response headers:', error.response.headers);
      }
      throw new Error(`Failed to export design as image: ${error.message}`);
    }
  }

  // Generate thumbnail for a template
  async generateTemplateThumbnail(templateId, options = {}) {
    try {
      if (!this.apiKey) {
        throw new Error('Unlayer API key not configured');
      }

      // First get the template
      const template = await this.getTemplateById(templateId);
      
      if (!template || !template.design) {
        throw new Error('Template or template design not found');
      }

      // Export the design as an image
      const imageData = await this.exportDesignAsImage(template.design, {
        fullPage: false, // Generate a thumbnail, not full page
        ...options
      });

      // Return the URL from the response data
      return imageData.data?.url || imageData.url;
    } catch (error) {
      console.error('Error generating template thumbnail:', error.message);
      throw new Error(`Failed to generate template thumbnail: ${error.message}`);
    }
  }

  // Check if API is configured and working
  async healthCheck() {
    try {
      if (!this.apiKey) {
        return { configured: false, working: false };
      }

      // Try to fetch a small number of templates to test connectivity
      await this.getTemplates({ limit: 1 });
      return { configured: true, working: true };
    } catch (error) {
      return { configured: true, working: false, error: error.message };
    }
  }
}

module.exports = new UnlayerService();
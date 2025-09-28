// emailxp/backend/services/automationExecutor.js

const Automation = require('../models/Automation');
const Template = require('../models/Template');
const Subscriber = require('../models/Subscriber');
const logger = require('../utils/logger');
const { addEmailJob } = require('./queueService');

/**
 * Execute automation actions for a given automation and context
 * @param {String|Object} automationRef - automation id or automation object
 * @param {Object} context - { userId, subscriberId, event }
 */
const executeAutomation = async (automationRef, context = {}) => {
  try {
    const automation = typeof automationRef === 'string' ? await Automation.findById(automationRef) : automationRef;
    if (!automation) {
      throw new Error('Automation not found');
    }

    // For now, run actions sequentially in order
    const rawActions = automation.actions || automation.nodes || [];
    for (const raw of rawActions) {
      // Normalize between UI 'actions' shape and 'nodes' shape
      const action = raw.type ? raw : { type: raw.type || raw.nodeType || raw.data?.type, config: raw.config || raw.data || {} };
      try {
        if (action.type === 'send_template' || action.type === 'send_email_template') {
          await handleSendTemplateAction(action, automation, context);
        } else if (action.type === 'send_email') {
          // leave existing send_email behavior to campaign engine (not implemented here)
          logger.log('[AutomationExecutor] send_email action skipped in executor (use campaign engine)');
        } else {
          logger.log(`[AutomationExecutor] Unknown or unimplemented action type: ${action.type}`);
        }
      } catch (err) {
        logger.error('[AutomationExecutor] Action failed', { action: action.id || action, error: err.message });
      }
    }
  } catch (error) {
    logger.error('[AutomationExecutor] executeAutomation failed', { error: error.message });
    throw error;
  }
};

const handleSendTemplateAction = async (action, automation, context) => {
  const templateId = action.config?.templateId || action.templateId || action.config?.template;
  if (!templateId) {
    logger.warn('[AutomationExecutor] send_template action missing templateId');
    return;
  }

  const template = await Template.findById(templateId);
  if (!template) {
    logger.warn('[AutomationExecutor] template not found', { templateId });
    return;
  }

  const subscriber = context.subscriberId ? await Subscriber.findById(context.subscriberId) : null;
  if (!subscriber) {
    logger.warn('[AutomationExecutor] subscriber not found for send_template', { subscriberId: context.subscriberId });
    return;
  }

  // Personalize subject and content using simple replacements (reuse Template.generateHTML if available)
  const subject = (action.config?.subjectOverride && action.config.subjectOverride.trim()) || template.subject || '';
  const htmlContent = template.htmlContent || (template.generateHTML ? template.generateHTML() : '');
  const plainTextContent = template.plainTextContent || (template.generatePlainText ? template.generatePlainText() : '');

  // Simple placeholder replacement
  const personalize = (s) => {
    if (!s) return s;
    return s.replace(/\{\{firstName\}\}/g, subscriber.firstName || '')
      .replace(/\{\{lastName\}\}/g, subscriber.lastName || '')
      .replace(/\{\{email\}\}/g, subscriber.email || '')
      .replace(/\{\{name\}\}/g, `${subscriber.firstName || ''} ${subscriber.lastName || ''}`.trim());
  };

  const emailData = {
    toEmail: subscriber.email,
    subject: personalize(subject),
    htmlContent: personalize(htmlContent),
    plainTextContent: personalize(plainTextContent),
    campaignId: null,
    subscriberId: subscriber._id,
    automationId: automation._id || automation.id,
    actionId: action.id || action._id,
    fromEmail: action.config?.fromEmail || template.fromEmail || process.env.EMAIL_FROM,
    fromName: action.config?.fromName || template.fromName || 'EmailXP'
  };

  await addEmailJob(emailData, { delay: action.config?.delay || 0 });
  // Update template usage stats if applicable
  try { template.incrementUsage && template.incrementUsage(); } catch (e) { /* ignore */ }
  logger.log('[AutomationExecutor] queued send_template email', { to: subscriber.email, automationId: automation._id });
};

module.exports = { executeAutomation };

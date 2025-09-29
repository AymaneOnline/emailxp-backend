// emailxp/backend/services/automationExecutor.js

const Automation = require('../models/Automation');
const Template = require('../models/Template');
const Subscriber = require('../models/Subscriber');
const logger = require('../utils/logger');
const { addEmailJob } = require('./queueService');
const mongoose = require('mongoose');

/**
 * Execute automation actions for a given automation and context
 * @param {String|Object} automationRef - automation id or automation object
 * @param {Object} context - { userId, subscriberId, event }
 */
const executeAutomation = async (automationRef, context = {}) => {
  try {
    // Accept either an automation document or an id (string/ObjectId).
    let automation;
    if (typeof automationRef === 'string' || mongoose.isValidObjectId(automationRef)) {
      automation = await Automation.findById(automationRef);
    } else {
      automation = automationRef;
    }
    if (!automation) {
      throw new Error('Automation not found');
    }

    // Detailed log for debugging: automation metadata and nodes summary
    try {
      const nodeSummaries = (automation.nodes || automation.actions || []).map(n => {
        const t = n?.data?.actionType || n?.data?.type || n?.type || n?.nodeType || n?.type;
        const tid = n?.data?.config?.templateId || n?.config?.templateId || n?.data?.templateId || n?.templateId || null;
        return { id: n?.id || n?._id || null, type: t, templateId: tid };
      });
      logger.info('[AutomationExecutor] executing automation', { automationId: automation._id ? automation._id.toString() : automation.id, name: automation.name, isActive: !!automation.isActive, status: automation.status, nodes: nodeSummaries });
      // Mirror to console for test runs so we always see this in the terminal
      try { console.log('[AutomationExecutor] executing automation', JSON.stringify({ automationId: automation._id ? automation._id.toString() : automation.id, name: automation.name, nodes: nodeSummaries })); } catch (e) { console.log('[AutomationExecutor] executing automation', { automationId: automation._id ? automation._id.toString() : automation.id, name: automation.name, nodes: nodeSummaries }); }
    } catch (e) {
      logger.warn('[AutomationExecutor] failed to log automation summary', { error: e?.message || e });
    }

    if (automation.isActive === false) {
      logger.info('[AutomationExecutor] automation is inactive - skipping execution', { automationId: automation._id ? automation._id.toString() : automation.id });
      return;
    }

  // For now, run actions sequentially in order
  const rawActions = automation.actions || automation.nodes || [];
  let actionsRun = 0;
  let emailsQueued = 0;
  for (const raw of rawActions) {
      // Normalize nodes produced by the UI editor which sometimes store the actionable
      // payload under `data` or `config`. We want a normalized shape { type, config }
      let action;
      if (raw && raw.data) {
        // UI nodes often store actionable payload under data.actionType or data.config
        const t = raw.data.actionType || raw.data.type || raw.type || raw.nodeType;
        const cfg = raw.data.config || raw.config || raw.data;
        action = { id: raw.id || raw._id || null, type: t, config: cfg };
      } else if (raw && raw.config) {
        action = { id: raw.id || raw._id || null, type: raw.config.type || raw.type || raw.nodeType, config: raw.config };
      } else if (raw && (raw.type === 'send_template' || raw.nodeType === 'send_template')) {
        action = { id: raw.id || raw._id || null, type: raw.type || raw.nodeType, config: raw };
      } else {
        // fallback - try best-effort mapping
        action = { id: raw.id || raw._id || null, type: raw.type || raw.nodeType || raw.data?.type, config: raw.config || raw.data || {} };
      }

      // Ensure any templateId present at top-level or alternative locations is copied into the normalized action
      try {
        const foundTid = raw?.templateId || raw?.data?.templateId || raw?.data?.config?.templateId || raw?.config?.templateId || action.config?.templateId || action.templateId || null;
        if (foundTid) {
          // prefer setting under config.templateId for downstream code that reads it
          action.config = action.config || {};
          if (!action.config.templateId) action.config.templateId = foundTid;
          action.templateId = foundTid;
        }
      } catch (e) {
        // ignore
      }

      // Some editor versions store a generic node.type === 'action' with a nested
      // config that contains actionType or templateId. Treat those as send_template
      // when appropriate so they actually execute.
      try {
        const hasTemplate = !!(action.config?.templateId || action.config?.config?.templateId || action.templateId || action.config?.template);
        const configActionType = action.config?.actionType || action.config?.type || null;
        if ((action.type === 'action' || action.type === 'generic_action') && (hasTemplate || configActionType === 'send_template')) {
          logger.info('[AutomationExecutor] normalizing generic action node to send_template', { originalType: action.type, inferredTemplate: action.config?.templateId || action.config?.config?.templateId || null });
          action.type = 'send_template';
        }
      } catch (e) {
        // ignore normalization errors
      }
          try {
        // Log action details
        try {
          const inferredTemplateId = action.config?.templateId || action.config?.config?.templateId || action.templateId || null;
          logger.info('[AutomationExecutor] executing action', { actionType: action.type, actionId: action.id || action._id || null, templateId: inferredTemplateId });
              try { console.log('[AutomationExecutor] executing action', { actionType: action.type, actionId: action.id || action._id || null, templateId: inferredTemplateId }); } catch (e) { /* ignore */ }
        } catch (e) {
          logger.warn('[AutomationExecutor] failed to log action details', { error: e?.message || e });
        }

        if (action.type === 'send_template' || action.type === 'send_email_template') {
          const queued = await handleSendTemplateAction(action, automation, context);
          actionsRun += 1;
          emailsQueued += Number(queued || 0);
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
    // Return a small execution summary
    return { automationId: automation._id || automation.id, actionsRun, emailsQueued };
  } catch (error) {
    logger.error('[AutomationExecutor] executeAutomation failed', { error: error.message });
    throw error;
  }
};

const handleSendTemplateAction = async (action, automation, context) => {
  // Support multiple shapes: action.config.templateId OR action.config.config.templateId
  const templateId = action.config?.templateId || action.config?.config?.templateId || action.config?.config?.template || action.templateId || action.config?.template;
  if (!templateId) {
    logger.warn('[AutomationExecutor] send_template action missing templateId');
    console.log('[AutomationExecutor] send_template action missing templateId for action', JSON.stringify(action.config || action));
    return 0;
  }

  const template = await Template.findById(templateId);
  if (!template) {
    logger.warn('[AutomationExecutor] template not found', { templateId });
    console.log('[AutomationExecutor] template not found for templateId', templateId);
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
    // propagate template id so downstream services (queue/resend/emailTracking) can persist it
    templateId: template._id || template.id,
    // let downstream services know if the template requests no auto footer
    templateDisableAutoFooter: !!template.disableAutoFooter,
    fromEmail: action.config?.fromEmail || template.fromEmail || process.env.EMAIL_FROM,
    fromName: action.config?.fromName || template.fromName || 'EmailXP'
  };

  try {
    try { console.log('[AutomationExecutor] about to add email job', { emailData }); } catch (e) { /* ignore */ }
    const job = await addEmailJob(emailData, { delay: action.config?.delay || 0 });
    // job may be an inline send result (id starts with inline-send-) or a Bull job
    const queuedId = job && job.id ? job.id : (job && job.inline && job.result && job.id) ? job.id : (job && job.id) || null;
    logger.log('[AutomationExecutor] queued send_template email', { to: subscriber.email, automationId: automation._id, jobId: queuedId });
    try { console.log('[AutomationExecutor] queued send_template email', { to: subscriber.email, automationId: automation._id ? automation._id.toString() : automation.id, jobId: queuedId }); } catch (e) { /* ignore */ }
    try { console.log('[AutomationExecutor] EMAIL_QUEUED_OR_SENT', { to: subscriber.email, automationId: automation._id ? automation._id.toString() : automation.id, templateId: template._id ? template._id.toString() : template.id, actionId: action.id || action._id || null, jobId: queuedId }); } catch (e) { /* ignore */ }
  } catch (e) {
    logger.error('[AutomationExecutor] Failed to queue email job', { error: e?.message || e });
    console.log('[AutomationExecutor] Failed to queue email job', { error: e?.message || e });
    return 0;
  }
  // Update template usage stats if applicable
  try { template.incrementUsage && template.incrementUsage(); } catch (e) { /* ignore */ }
  logger.log('[AutomationExecutor] queued send_template email', { to: subscriber.email, automationId: automation._id });
  return 1;
};

module.exports = { executeAutomation };

// emailxp/backend/controllers/trackingController.js

const Campaign = require('../models/Campaign');
const Subscriber = require('../models/Subscriber');
const logger = require('../utils/logger');

const { EventWebhook } = require('@sendgrid/eventwebhook');

const SENDGRID_WEBHOOK_SECRET = process.env.SENDGRID_WEBHOOK_SECRET;

/**
 * @desc Middleware to verify SendGrid webhook signatures
 */
exports.verifyWebhookSignature = (req, res, next) => {
    const signature = req.headers['x-twilio-email-event-webhook-signature'];
    const timestamp = req.headers['x-twilio-email-event-webhook-timestamp'];
    const payload = req.rawBody;

    logger.log(`[DEBUG - Webhook Verify] === Entering verification middleware ===`);
    logger.log(`[DEBUG - Webhook Verify] Signature Header: "${signature}"`);
    logger.log(`[DEBUG - Webhook Verify] Timestamp Header: "${timestamp}"`);
    logger.log(`[DEBUG - Webhook Verify] Raw Body Preview: "${payload?.toString().substring(0, 100)}"`);
    logger.log(`[DEBUG - Webhook Verify] SENDGRID_WEBHOOK_SECRET set: ${!!SENDGRID_WEBHOOK_SECRET}`);

    // Skip verification if no webhook secret is configured
    if (!SENDGRID_WEBHOOK_SECRET) {
        logger.warn('[Webhook] No webhook secret configured — skipping verification');
        return next();
    }

    // Check for required headers and payload
    if (!signature || !timestamp || !payload) {
        logger.error('[Webhook Verification] Missing required signature headers or body');
        logger.error(`[Webhook Verification] signature: ${!!signature}, timestamp: ${!!timestamp}, payload: ${!!payload}`);
        
        // In development, allow unsigned webhooks for testing
        if (process.env.NODE_ENV === 'development') {
            logger.warn('[Webhook] Allowing unsigned webhook in development mode');
            return next();
        }
        
        return res.status(401).json({ error: 'Unauthorized: Missing required data' });
    }

    try {
        logger.log('[Webhook Verification] Attempting to verify signature...');
        
        // Create EventWebhook instance
        const eventWebhook = new EventWebhook();
        
        // Convert the public key to ECDSA format
        const ecPublicKey = eventWebhook.convertPublicKeyToECDSA(SENDGRID_WEBHOOK_SECRET);
        
        // Verify the signature using the correct method signature
        const isVerified = eventWebhook.verifySignature(
            ecPublicKey,
            payload.toString(),
            signature,
            timestamp
        );

        if (isVerified) {
            logger.log('[Webhook Verification] Signature verified successfully');
            next();
        } else {
            logger.error('[Webhook Verification] Signature verification failed');
            
            // In development, allow failed verification for testing
            if (process.env.NODE_ENV === 'development') {
                logger.warn('[Webhook] Allowing failed verification in development mode');
                return next();
            }
            
            res.status(401).json({ error: 'Unauthorized: Invalid signature' });
        }
    } catch (err) {
        logger.error('[Webhook Verification Error]', err);
        logger.error('[Webhook Verification Error] Stack:', err.stack);
        
        // In development, continue despite verification errors
        if (process.env.NODE_ENV === 'development') {
            logger.warn('[Webhook] Continuing despite verification error in development mode');
            return next();
        }
        
        // In production, return 200 to prevent SendGrid from retrying
        res.status(200).json({ message: 'Webhook received with verification error' });
    }
};

/**
 * @desc Handle SendGrid Webhook events (processed, delivered, open, click, bounce, etc.)
 */
exports.handleWebhook = async (req, res) => {
    try {
        logger.log('[Webhook] Received SendGrid webhook request');
        logger.log('[Webhook] Request body type:', typeof req.body);
        logger.log('[Webhook] Request body:', JSON.stringify(req.body, null, 2));

        // Ensure req.body is an array
        const events = Array.isArray(req.body) ? req.body : [req.body];
        
        if (events.length === 0) {
            logger.warn('[Webhook] No events found in request body');
            return res.status(200).json({ message: 'No events to process' });
        }

        logger.log(`[Webhook] Processing ${events.length} events`);

        for (const event of events) {
            try {
                logger.log(`[Webhook] Processing event: ${event.event} for ${event.email}`);
                
                // Extract custom arguments with fallback
                const customArgs = event.custom_args || event.customArgs || {};
                const { campaignId, subscriberId, listId } = customArgs;

                logger.log(`[Webhook] Custom args - Campaign ID: ${campaignId}, Subscriber ID: ${subscriberId}, List ID: ${listId}`);

                // Skip events without required custom arguments
                if (!campaignId || !subscriberId) {
                    logger.warn(`[Webhook] Missing required custom_args (campaignId: ${campaignId}, subscriberId: ${subscriberId}) for event type ${event.event}. Skipping.`);
                    continue;
                }

                // Validate that IDs are valid ObjectIds
                if (!isValidObjectId(campaignId) || !isValidObjectId(subscriberId)) {
                    logger.warn(`[Webhook] Invalid ObjectId format - campaignId: ${campaignId}, subscriberId: ${subscriberId}. Skipping.`);
                    continue;
                }

                // Find subscriber and campaign
                const subscriber = await Subscriber.findById(subscriberId);
                if (!subscriber) {
                    logger.warn(`[Webhook] Subscriber with ID ${subscriberId} not found`);
                    continue;
                }

                const campaign = await Campaign.findById(campaignId);
                if (!campaign) {
                    logger.warn(`[Webhook] Campaign with ID ${campaignId} not found`);
                    continue;
                }

                // Process different event types
                await processWebhookEvent(event, campaign, subscriber, campaignId, subscriberId);

            } catch (eventError) {
                logger.error(`[Webhook Error] Failed to process individual event:`, eventError);
                // Continue processing other events even if one fails
                continue;
            }
        }

        logger.log('[Webhook] All events processed successfully');
        res.status(200).json({ message: 'Webhook received and processed' });

    } catch (error) {
        logger.error(`[Webhook Error] Failed to process webhook:`, error);
        // Return 200 to prevent SendGrid from retrying
        res.status(200).json({ message: 'Webhook received with processing error' });
    }
};

/**
 * @desc Process individual webhook events
 */
async function processWebhookEvent(event, campaign, subscriber, campaignId, subscriberId) {
    switch (event.event) {
        case 'open':
            logger.log(`[Webhook] Email opened by ${event.email}`);
            await Campaign.findByIdAndUpdate(campaignId, { $inc: { opens: 1 } });
            break;

        case 'click':
            logger.log(`[Webhook] Link clicked by ${event.email}, URL: ${event.url || 'N/A'}`);
            await Campaign.findByIdAndUpdate(campaignId, { $inc: { clicks: 1 } });
            break;

        case 'bounce':
            logger.log(`[Webhook] Email bounced for ${event.email}, Type: ${event.type}, Reason: ${event.reason || 'N/A'}`);
            await Campaign.findByIdAndUpdate(campaignId, { $inc: { bouncedCount: 1 } });
            
            // For hard bounces, mark subscriber as bounced
            if (event.type === 'hard') {
                await Subscriber.findByIdAndUpdate(subscriberId, { status: 'bounced' });
                logger.log(`[Webhook] Subscriber ${subscriberId} marked as bounced due to hard bounce`);
            }
            break;

        case 'dropped':
            logger.log(`[Webhook] Email dropped for ${event.email}, Reason: ${event.reason || 'N/A'}`);
            // Optionally increment a dropped count if you have this field
            // await Campaign.findByIdAndUpdate(campaignId, { $inc: { droppedCount: 1 } });
            break;

        case 'spamreport':
            logger.log(`[Webhook] Spam report from ${event.email}`);
            await Campaign.findByIdAndUpdate(campaignId, { $inc: { complaintCount: 1 } });
            await Subscriber.findByIdAndUpdate(subscriberId, { status: 'unsubscribed' });
            logger.log(`[Webhook] Subscriber ${subscriberId} unsubscribed due to spam report`);
            break;

        case 'unsubscribe':
            logger.log(`[Webhook] Email unsubscribed by ${event.email}`);
            await Campaign.findByIdAndUpdate(campaignId, { $inc: { unsubscribedCount: 1 } });
            await Subscriber.findByIdAndUpdate(subscriberId, { status: 'unsubscribed' });
            logger.log(`[Webhook] Subscriber ${subscriberId} unsubscribed`);
            break;

        case 'delivered':
            logger.log(`[Webhook] Email delivered to ${event.email}`);
            await Campaign.findByIdAndUpdate(campaignId, { $inc: { deliveredCount: 1 } });
            break;

        case 'processed':
            logger.log(`[Webhook] Email processed by SendGrid for ${event.email}`);
            // Optionally track processed emails
            break;

        case 'deferred':
            logger.log(`[Webhook] Email deferred for ${event.email}, Reason: ${event.response || 'N/A'}`);
            // Optionally track deferred emails
            break;

        default:
            logger.log(`[Webhook] Unhandled event type: ${event.event} for ${event.email}`);
            break;
    }
}

/**
 * @desc Validate if a string is a valid MongoDB ObjectId
 */
function isValidObjectId(id) {
    if (!id || typeof id !== 'string') return false;
    return /^[0-9a-fA-F]{24}$/.test(id);
}

/**
 * @desc Handle unsubscribe link clicks
 */
exports.unsubscribe = async (req, res) => {
    const { subscriberId } = req.params;
    const { campaignId } = req.query;

    logger.log(`[Unsubscribe] Attempting to unsubscribe subscriber ID: ${subscriberId} from campaign ID: ${campaignId || 'N/A'}`);

    try {
        // Validate subscriber ID format
        if (!isValidObjectId(subscriberId)) {
            logger.warn(`[Unsubscribe] Invalid subscriber ID format: ${subscriberId}`);
            return res.status(400).json({ error: 'Invalid subscriber ID format' });
        }

        // Find subscriber
        const subscriber = await Subscriber.findById(subscriberId);
        if (!subscriber) {
            logger.warn(`[Unsubscribe] Subscriber with ID ${subscriberId} not found`);
            return res.status(404).json({ error: 'Subscriber not found' });
        }

        // Check if already unsubscribed
        if (subscriber.status === 'unsubscribed') {
            logger.log(`[Unsubscribe] Subscriber ${subscriberId} already unsubscribed`);
            return res.status(200).json({ message: 'You have already unsubscribed' });
        }

        // Update subscriber status
        subscriber.status = 'unsubscribed';
        subscriber.unsubscribedAt = new Date();
        await subscriber.save();
        
        logger.log(`[Unsubscribe] Subscriber ${subscriberId} successfully unsubscribed`);

        // Update campaign unsubscribe count if campaign ID provided
        if (campaignId && isValidObjectId(campaignId)) {
            const campaign = await Campaign.findById(campaignId);
            if (campaign) {
                await Campaign.findByIdAndUpdate(campaignId, { $inc: { unsubscribedCount: 1 } });
                logger.log(`[Unsubscribe] Campaign ${campaignId} unsubscribed count incremented`);
            } else {
                logger.warn(`[Unsubscribe] Campaign ${campaignId} not found for unsubscribe tracking`);
            }
        }

        res.status(200).json({ message: 'You have successfully unsubscribed' });

    } catch (error) {
        logger.error(`[Unsubscribe Error] Failed to unsubscribe subscriber ${subscriberId}:`, error);
        res.status(500).json({ error: 'An error occurred during unsubscribe' });
    }
};
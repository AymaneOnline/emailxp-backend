// emailxp/backend/controllers/trackingController.js

const Campaign = require('../models/Campaign');
const Subscriber = require('../models/Subscriber');
const logger = require('../utils/logger');
const crypto = require('crypto');

const SENDGRID_WEBHOOK_SECRET = process.env.SENDGRID_WEBHOOK_SECRET;

/**
 * @desc Middleware to verify SendGrid webhook signatures
 */
exports.verifyWebhookSignature = (req, res, next) => {
    const signature = req.headers['x-twilio-email-event-webhook-signature'];
    const timestamp = req.headers['x-twilio-email-event-webhook-timestamp'];
    const payload = req.body; // This will be a Buffer from express.raw()

    logger.log(`[DEBUG - Webhook Verify] === Entering verification middleware ===`);
    logger.log(`[DEBUG - Webhook Verify] Request URL: ${req.originalUrl}`);
    logger.log(`[DEBUG - Webhook Verify] Request Method: ${req.method}`);
    logger.log(`[DEBUG - Webhook Verify] Content-Type: ${req.headers['content-type']}`);
    logger.log(`[DEBUG - Webhook Verify] Content-Length: ${req.headers['content-length']}`);
    logger.log(`[DEBUG - Webhook Verify] Signature Header: "${signature}"`);
    logger.log(`[DEBUG - Webhook Verify] Timestamp Header: "${timestamp}"`);
    logger.log(`[DEBUG - Webhook Verify] Raw Body exists: ${!!payload}`);
    logger.log(`[DEBUG - Webhook Verify] Raw Body type: ${typeof payload}`);
    logger.log(`[DEBUG - Webhook Verify] Raw Body length: ${payload?.length || 0}`);
    logger.log(`[DEBUG - Webhook Verify] SENDGRID_WEBHOOK_SECRET set: ${!!SENDGRID_WEBHOOK_SECRET}`);

    // Skip verification if no webhook secret is configured
    if (!SENDGRID_WEBHOOK_SECRET) {
        logger.warn('[Webhook] No webhook secret configured — skipping verification');
        // Parse the JSON body for the next middleware
        try {
            req.body = JSON.parse(payload.toString());
        } catch (e) {
            req.body = [];
        }
        return next();
    }

    // Check for required headers and payload
    if (!signature || !timestamp || !payload) {
        logger.error('[Webhook Verification] Missing required data for verification');
        logger.error(`[Webhook Verification] signature: ${!!signature}, timestamp: ${!!timestamp}, payload: ${!!payload}`);
        
        // In development, allow unsigned webhooks for testing
        if (process.env.NODE_ENV === 'development') {
            logger.warn('[Webhook] Allowing unsigned webhook in development mode');
            try {
                req.body = payload ? JSON.parse(payload.toString()) : [];
            } catch (e) {
                req.body = [];
            }
            return next();
        }
        
        return res.status(401).json({ error: 'Unauthorized: Missing signature data' });
    }

    try {
        logger.log('[Webhook Verification] Attempting to verify signature...');
        
        // SendGrid signature verification
        const payloadString = payload.toString();
        const signedPayload = timestamp + payloadString;
        
        // Create HMAC hash - SendGrid produces a HEX digest
        let expectedSignature = crypto
            .createHmac('sha256', SENDGRID_WEBHOOK_SECRET)
            .update(signedPayload)
            .digest('hex');
        
        // SendGrid sends signature in format "v1,signature1,signature2"
        // We need to check if our expected signature matches any of the provided signatures
        const signatures = signature.split(',');
        const isVerified = signatures.some(sig => {
            const cleanSig = sig.trim();
            // Remove "v1=" prefix if present
            let sigValue = cleanSig.startsWith('v1=') ? cleanSig.substring(3) : cleanSig;
            
            logger.log(`[DEBUG - Webhook Verify] --- Inside some() loop ---`);
            logger.log(`[DEBUG - Webhook Verify] Raw 'sig' part: "${sig}"`);

            // CRITICAL ADDITION: Sanitize sigValue to ensure only hex characters
            const originalSigValue = sigValue;
            sigValue = sigValue.replace(/[^0-9a-fA-F]/g, '');
            if (originalSigValue !== sigValue) {
                logger.warn(`[DEBUG - Webhook Verify] sigValue was sanitized. Original (length ${originalSigValue.length}): "${originalSigValue}", Cleaned (length ${sigValue.length}): "${sigValue}"`);
            }

            logger.log(`[DEBUG - Webhook Verify] Cleaned 'sigValue' (after sanitize): "${sigValue}" (length: ${sigValue.length})`);
            
            // CRITICAL ADDITION: Sanitize expectedSignature as well, just in case
            const originalExpectedSignature = expectedSignature;
            expectedSignature = expectedSignature.replace(/[^0-9a-fA-F]/g, '');
            if (originalExpectedSignature !== expectedSignature) {
                logger.warn(`[DEBUG - Webhook Verify] expectedSignature was sanitized. Original (length ${originalExpectedSignature.length}): "${originalExpectedSignature}", Cleaned (length ${expectedSignature.length}): "${expectedSignature}"`);
            }

            logger.log(`[DEBUG - Webhook Verify] Expected Signature (after sanitize): "${expectedSignature}" (length: ${expectedSignature.length})`);
            
            // Check expected byte lengths BEFORE conversion
            logger.log(`[DEBUG - Webhook Verify] Expected byte length for sigValue: ${Buffer.byteLength(sigValue, 'hex')}`);
            logger.log(`[DEBUG - Webhook Verify] Expected byte length for expectedSignature: ${Buffer.byteLength(expectedSignature, 'hex')}`);

            // Convert both to buffers using 'hex' encoding for a byte-by-byte comparison
            const bufferExpected = Buffer.from(expectedSignature, 'hex');
            const bufferReceived = Buffer.from(sigValue, 'hex');
            
            logger.log(`[DEBUG - Webhook Verify] Buffer.from(expectedSignature, 'hex') length: ${bufferExpected.length}`);
            logger.log(`[DEBUG - Webhook Verify] Buffer.from(sigValue, 'hex') length: ${bufferReceived.length}`);

            return crypto.timingSafeEqual(
                bufferExpected,
                bufferReceived
            );
        });

        if (isVerified) {
            logger.log('[Webhook Verification] Signature verified successfully');
            // Parse JSON body for next middleware
            req.body = JSON.parse(payloadString);
            next();
        } else {
            logger.error('[Webhook Verification] Signature verification failed');
            logger.error(`[Webhook Verification] Expected: ${expectedSignature}`);
            logger.error(`[Webhook Verification] Received: ${signature}`);
            
            // In development, allow failed verification for testing
            if (process.env.NODE_ENV === 'development') {
                logger.warn('[Webhook] Allowing failed verification in development mode');
                req.body = JSON.parse(payloadString);
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
            try {
                req.body = JSON.parse(payload.toString());
            } catch (parseErr) {
                req.body = [];
            }
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
        logger.log('[Webhook] === Webhook Handler Started ===');
        logger.log('[Webhook] Request method:', req.method);
        logger.log('[Webhook] Request headers:', JSON.stringify(req.headers, null, 2));
        logger.log('[Webhook] Request body type:', typeof req.body);
        logger.log('[Webhook] Request body:', JSON.stringify(req.body, null, 2));

        // Handle empty or invalid request body
        if (!req.body) {
            logger.warn('[Webhook] Request body is null or undefined');
            return res.status(200).json({ message: 'Empty webhook received' });
        }

        // Ensure req.body is an array
        let events;
        if (Array.isArray(req.body)) {
            events = req.body;
        } else if (typeof req.body === 'object' && req.body !== null) {
            events = [req.body];
        } else if (typeof req.body === 'string') {
            try {
                const parsed = JSON.parse(req.body);
                events = Array.isArray(parsed) ? parsed : [parsed];
            } catch (parseError) {
                logger.error('[Webhook] Failed to parse string body as JSON:', parseError);
                return res.status(200).json({ message: 'Invalid JSON in webhook body' });
            }
        } else {
            logger.warn('[Webhook] Unexpected body type:', typeof req.body);
            return res.status(200).json({ message: 'Unexpected webhook body format' });
        }
        
        // Filter out null, undefined, or invalid events
        const validEvents = events.filter(event => {
            if (!event || typeof event !== 'object') {
                logger.warn('[Webhook] Skipping invalid event (not an object):', event);
                return false;
            }
            if (!event.event) {
                logger.warn('[Webhook] Skipping event without event type:', JSON.stringify(event));
                return false;
            }
            return true;
        });

        if (validEvents.length === 0) {
            logger.warn('[Webhook] No valid events found in request body');
            return res.status(200).json({ message: 'No valid events to process' });
        }

        logger.log(`[Webhook] Processing ${validEvents.length} valid events out of ${events.length} total events`);

        for (let i = 0; i < validEvents.length; i++) {
            const event = validEvents[i];
            try {
                logger.log(`[Webhook] Processing event ${i + 1}/${validEvents.length}: ${event.event} for ${event.email || 'unknown email'}`);
                
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
                logger.error(`[Webhook Error] Failed to process individual event ${i + 1}:`, eventError);
                logger.error(`[Webhook Error] Event data:`, JSON.stringify(event, null, 2));
                // Continue processing other events even if one fails
                continue;
            }
        }

        logger.log('[Webhook] All events processed successfully');
        res.status(200).json({ message: 'Webhook received and processed' });

    } catch (error) {
        logger.error(`[Webhook Error] Failed to process webhook:`, error);
        logger.error(`[Webhook Error] Stack:`, error.stack);
        // Return 200 to prevent SendGrid from retrying
        res.status(200).json({ message: 'Webhook received with processing error' });
    }
};

/**
 * @desc Process individual webhook events
 */
async function processWebhookEvent(event, campaign, subscriber, campaignId, subscriberId) {
    // Safety check - ensure event and event.event exist
    if (!event || !event.event) {
        logger.error('[Webhook] Invalid event object - missing event type');
        return;
    }

    const eventType = event.event;
    const email = event.email || 'unknown@email.com';
    const timestamp = event.timestamp || Date.now();

    logger.log(`[Webhook] Processing ${eventType} event for ${email} at ${new Date(timestamp * 1000).toISOString()}`);

    try {
        switch (eventType) {
            case 'open':
                logger.log(`[Webhook] Email opened by ${email}`);
                await Campaign.findByIdAndUpdate(
                    campaignId, 
                    { 
                        $inc: { opens: 1 },
                        $set: { lastActivity: new Date() }
                    }
                );
                break;

            case 'click':
                logger.log(`[Webhook] Link clicked by ${email}, URL: ${event.url || 'N/A'}`);
                await Campaign.findByIdAndUpdate(
                    campaignId, 
                    { 
                        $inc: { clicks: 1 },
                        $set: { lastActivity: new Date() }
                    }
                );
                break;

            case 'bounce':
                logger.log(`[Webhook] Email bounced for ${email}, Type: ${event.type || 'N/A'}, Reason: ${event.reason || 'N/A'}`);
                await Campaign.findByIdAndUpdate(
                    campaignId, 
                    { 
                        $inc: { bouncedCount: 1 },
                        $set: { lastActivity: new Date() }
                    }
                );
                
                // For hard bounces, mark subscriber as bounced
                if (event.type === 'hard') {
                    await Subscriber.findByIdAndUpdate(subscriberId, { 
                        status: 'bounced',
                        bouncedAt: new Date()
                    });
                    logger.log(`[Webhook] Subscriber ${subscriberId} marked as bounced due to hard bounce`);
                }
                break;

            case 'dropped':
                logger.log(`[Webhook] Email dropped for ${email}, Reason: ${event.reason || 'N/A'}`);
                await Campaign.findByIdAndUpdate(
                    campaignId, 
                    { 
                        $inc: { droppedCount: 1 },
                        $set: { lastActivity: new Date() }
                    }
                );
                break;

            case 'spamreport':
                logger.log(`[Webhook] Spam report from ${email}`);
                await Campaign.findByIdAndUpdate(
                    campaignId, 
                    { 
                        $inc: { complaintCount: 1 },
                        $set: { lastActivity: new Date() }
                    }
                );
                await Subscriber.findByIdAndUpdate(subscriberId, { 
                    status: 'complained',
                    complainedAt: new Date()
                });
                logger.log(`[Webhook] Subscriber ${subscriberId} marked as complained due to spam report`);
                break;

            case 'unsubscribe':
                logger.log(`[Webhook] Email unsubscribed by ${email}`);
                await Campaign.findByIdAndUpdate(
                    campaignId, 
                    { 
                        $inc: { unsubscribedCount: 1 },
                        $set: { lastActivity: new Date() }
                    }
                );
                await Subscriber.findByIdAndUpdate(subscriberId, { 
                    status: 'unsubscribed',
                    unsubscribedAt: new Date()
                });
                logger.log(`[Webhook] Subscriber ${subscriberId} unsubscribed`);
                break;

            case 'delivered':
                logger.log(`[Webhook] Email delivered to ${email}`);
                await Campaign.findByIdAndUpdate(
                    campaignId, 
                    { 
                        $inc: { deliveredCount: 1 },
                        $set: { lastActivity: new Date() }
                    }
                );
                break;

            case 'processed':
                logger.log(`[Webhook] Email processed by SendGrid for ${email}`);
                await Campaign.findByIdAndUpdate(
                    campaignId, 
                    { 
                        $inc: { processedCount: 1 },
                        $set: { lastActivity: new Date() }
                    }
                );
                break;

            case 'deferred':
                logger.log(`[Webhook] Email deferred for ${email}, Reason: ${event.response || 'N/A'}`);
                await Campaign.findByIdAndUpdate(
                    campaignId, 
                    { 
                        $inc: { deferredCount: 1 },
                        $set: { lastActivity: new Date() }
                    }
                );
                break;

            default:
                logger.log(`[Webhook] Unhandled event type: ${eventType} for ${email}`);
                break;
        }

        logger.log(`[Webhook] Successfully processed ${eventType} event for ${email}`);

    } catch (dbError) {
        logger.error(`[Webhook] Database error processing ${eventType} event for ${email}:`, dbError);
        throw dbError; // Re-throw to be caught by the calling function
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
                await Campaign.findByIdAndUpdate(
                    campaignId, 
                    { 
                        $inc: { unsubscribedCount: 1 },
                        $set: { lastActivity: new Date() }
                    }
                );
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
// emailxp/backend/controllers/trackingController.js

const Campaign = require('../models/Campaign');
const Subscriber = require('../models/Subscriber');
const logger = require('../utils/logger'); // Assuming you have a logger utility

// --- NEW IMPORTS FOR WEBHOOK VERIFICATION ---
const { EventWebhook } = require('@sendgrid/eventwebhook');
// --- END NEW IMPORTS ---

// --- Get SendGrid Webhook Secret from environment variables ---
const SENDGRID_WEBHOOK_SECRET = process.env.SENDGRID_WEBHOOK_SECRET;

/**
 * @desc Middleware to verify SendGrid webhook signatures.
 * This is crucial when "Signed Events" is enabled in SendGrid.
 * It expects the raw request body to be available on req.rawBody (captured by server.js middleware).
 */
exports.verifyWebhookSignature = (req, res, next) => {
    // --- DEBUG LOGS: These logs will now execute IMMEDIATELY when the middleware is entered. ---
    const signature = req.headers['x-twilio-email-event-webhook-signature'];
    const timestamp = req.headers['x-twilio-email-event-webhook-timestamp'];
    const payload = req.rawBody; // This comes from the server.js middleware

    logger.log(`[DEBUG - Webhook Verify] === Entering verification middleware ===`);
    logger.log(`[DEBUG - Webhook Verify] Signature Header: "${signature}" (type: ${typeof signature})`);
    logger.log(`[DEBUG - Webhook Verify] Timestamp Header: "${timestamp}" (type: ${typeof timestamp})`);
    logger.log(`[DEBUG - Webhook Verify] Raw Body Content (first 100 chars): "${payload ? payload.substring(0, Math.min(payload.length, 100)) : 'N/A'}" (type: ${typeof payload}, length: ${payload ? payload.length : 'N/A'})`);
    logger.log(`[DEBUG - Webhook Verify] SENDGRID_WEBHOOK_SECRET set: ${!!SENDGRID_WEBHOOK_SECRET}`);
    // --- END DEBUG LOGS ---

    // If no secret, or if we're not in production and it's missing (for dev convenience)
    if (!SENDGRID_WEBHOOK_SECRET) {
        logger.warn('[Webhook] SENDGRID_WEBHOOK_SECRET is not set. Skipping webhook signature verification.');
        return next(); // Skip verification and proceed
    }

    // Check for essential headers and raw body
    if (!signature || !timestamp || !payload) {
        logger.error('[Webhook Verification] Missing signature, timestamp, or raw body. Rejecting webhook.');
        return res.status(401).send('Unauthorized: Missing required webhook data');
    }

    try {
        const eb = new EventWebhook(SENDGRID_WEBHOOK_SECRET);
        
        // Verify the signature using the raw payload
        const isVerified = eb.verifySignature(
            {
                signature: signature,
                timestamp: timestamp,
                payload: payload
            }
        );

        if (isVerified) {
            logger.log('[Webhook Verification] Signature verified successfully.');
            next(); // Proceed to the next middleware (handleWebhook)
        } else {
            logger.error('[Webhook Verification] Invalid signature. Rejecting webhook.');
            res.status(401).send('Unauthorized: Invalid signature');
        }
    } catch (error) {
        logger.error('[Webhook Verification Error]', error);
        // Do not send 500 status to SendGrid, as they will retry indefinitely.
        // Log the error and send 200, letting SendGrid know we "processed" it (even if with an internal error).
        res.status(200).send('Webhook processed with internal verification error.');
    }
};

/**
 * @desc Handle SendGrid Webhook events (processed, delivered, open, click, bounce, etc.)
 * This endpoint receives event data from SendGrid.
 * It's crucial to set up this URL in your SendGrid account under Settings > Mail Settings > Event Webhook.
 * DO NOT send a 200 OK response until you have successfully processed the event, or SendGrid will retry.
 */
exports.handleWebhook = async (req, res) => {
    // req.body is already parsed into a JSON array of events by express.json()
    logger.log('[Webhook] Received SendGrid events:', req.body.length, 'events');

    for (const event of req.body) {
        logger.log(`[Webhook] Processing event: ${event.event} for ${event.email}, Campaign ID: ${event.campaignId}, Subscriber ID: ${event.subscriberId}, List ID: ${event.listId}`);

        // Extract custom arguments. These should now be present if verification passed.
        const { campaignId, subscriberId, listId } = event.custom_args || {};

        // Basic validation for required IDs from custom_args
        if (!campaignId || !subscriberId || !listId) {
            logger.warn(`[Webhook] Missing custom_args for event type ${event.event}. Campaign ID: ${campaignId}, Subscriber ID: ${subscriberId}, List ID: ${listId}. Skipping processing for this event.`);
            continue; // Continue to the next event in the batch
        }

        try {
            const subscriber = await Subscriber.findById(subscriberId);
            if (!subscriber) {
                logger.warn(`[Webhook] Subscriber with ID ${subscriberId} not found for list ${listId}. Skipping event.`);
                continue;
            }

            const campaign = await Campaign.findById(campaignId);
            if (!campaign) {
                logger.warn(`[Webhook] Campaign with ID ${campaignId} not found for subscriber ${subscriberId}. Skipping event.`);
                continue;
            }

            switch (event.event) {
                case 'open':
                    logger.log(`[Webhook] Email opened by ${event.email} for Campaign ${campaignId}`);
                    await Campaign.findByIdAndUpdate(campaignId, { $inc: { opens: 1 } });
                    break;
                case 'click':
                    logger.log(`[Webhook] Link clicked by ${event.email} for Campaign ${campaignId}, URL: ${event.url}`);
                    await Campaign.findByIdAndUpdate(campaignId, { $inc: { clicks: 1 } });
                    break;
                case 'bounce':
                    logger.log(`[Webhook] Email bounced for ${event.email}, Reason: ${event.reason}`);
                    await Campaign.findByIdAndUpdate(campaignId, { $inc: { bouncedCount: 1 } });
                    // Consider updating subscriber status to 'bounced' if it's a hard bounce
                    // if (event.type === 'hardbounce') {
                    //    await Subscriber.findByIdAndUpdate(subscriberId, { status: 'bounced' });
                    // }
                    break;
                case 'dropped': // Email dropped due to prior bounce, unsubscribe, invalid email, etc.
                    logger.log(`[Webhook] Email dropped for ${event.email}, Reason: ${event.reason}`);
                    // Increment a dropped count or update subscriber status if appropriate
                    break;
                case 'spamreport':
                    logger.log(`[Webhook] Spam report from ${event.email}`);
                    await Campaign.findByIdAndUpdate(campaignId, { $inc: { complaintCount: 1 } });
                    await Subscriber.findByIdAndUpdate(subscriberId, { status: 'unsubscribed' }); // Auto-unsubscribe
                    break;
                case 'unsubscribe':
                    logger.log(`[Webhook] Email unsubscribed by ${event.email}`);
                    await Campaign.findByIdAndUpdate(campaignId, { $inc: { unsubscribedCount: 1 } });
                    await Subscriber.findByIdAndUpdate(subscriberId, { status: 'unsubscribed' });
                    break;
                case 'delivered':
                    logger.log(`[Webhook] Email delivered to ${event.email}`);
                    // No specific action usually needed here if emailsSent is already updated
                    break;
                case 'processed':
                    logger.log(`[Webhook] Email processed by SendGrid for ${event.email}`);
                    // No specific action usually needed here
                    break;
                default:
                    logger.log(`[Webhook] Unhandled event type: ${event.event} for ${event.email}`);
            }

        } catch (error) {
            logger.error(`[Webhook Error] Failed to process event for ${event.email}, type ${event.event}:`, error);
            // Log the error but continue processing other events in the batch.
            // Do not send a 500 status here, as SendGrid will retry the entire batch.
        }
    }

    // Always send a 200 OK after attempting to process all events to tell SendGrid not to retry this batch.
    res.status(200).send('Webhook received and processed');
};

/**
 * @desc Handle direct unsubscribe link clicks.
 * This is for your custom unsubscribe link that you inject into the email content.
 * Your SendGrid webhook will also catch unsubscribe events if SendGrid automatically adds unsubscribe links.
 * @route GET /api/track/unsubscribe/:subscriberId
 * @access Public (accessible from email)
 */
exports.unsubscribe = async (req, res) => {
    const { subscriberId } = req.params;
    const { campaignId } = req.query; // If you want to track which campaign they unsubscribed from

    logger.log(`[Unsubscribe] Attempting to unsubscribe subscriber ID: ${subscriberId} from campaign ID: ${campaignId || 'N/A'}`);

    try {
        const subscriber = await Subscriber.findById(subscriberId);

        if (!subscriber) {
            logger.warn(`[Unsubscribe] Subscriber with ID ${subscriberId} not found.`);
            return res.status(404).send('Subscriber not found.');
        }

        if (subscriber.status === 'unsubscribed') {
            logger.log(`[Unsubscribe] Subscriber ${subscriberId} is already unsubscribed.`);
            return res.status(200).send('You have already unsubscribed from this list.');
        }

        subscriber.status = 'unsubscribed';
        await subscriber.save();
        logger.log(`[Unsubscribe] Subscriber ${subscriberId} successfully unsubscribed.`);

        // Optionally, update campaign unsubscribed count immediately (webhook might do this too)
        if (campaignId) {
            await Campaign.findByIdAndUpdate(campaignId, { $inc: { unsubscribedCount: 1 } });
            logger.log(`[Unsubscribe] Campaign ${campaignId} unsubscribed count incremented.`);
        }

        // Render a simple confirmation page or redirect
        res.status(200).send('You have successfully unsubscribed.'); // Or send an HTML confirmation page
    } catch (error) {
        logger.error(`[Unsubscribe Error] Failed to unsubscribe subscriber ${subscriberId}:`, error);
        res.status(500).send('An error occurred during unsubscribe.');
    }
};

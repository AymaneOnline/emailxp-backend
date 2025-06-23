// emailxp/backend/controllers/trackingController.js

const Campaign = require('../models/Campaign');
const Subscriber = require('../models/Subscriber');
const logger = require('../utils/logger');

// --- NEW IMPORTS FOR WEBHOOK VERIFICATION ---
const { EventWebhook } = require('@sendgrid/eventwebhook');
// Node.js built-in crypto module is not directly used by EventWebhook.verifySignature,
// but it's good to keep in mind for manual verification if ever needed.
// const crypto = require('crypto');
// --- END NEW IMPORTS ---

// --- NEW: Get SendGrid Webhook Secret from environment variables ---
const SENDGRID_WEBHOOK_SECRET = process.env.SENDGRID_WEBHOOK_SECRET;

// --- NEW: Webhook Verification Middleware (NOW EXPORTED) ---
exports.verifyWebhookSignature = (req, res, next) => {
    // If no secret, skip verification (NOT RECOMMENDED IN PROD IF SIGNED EVENTS IS ON)
    if (!SENDGRID_WEBHOOK_SECRET) {
        logger.warn('[Webhook] SENDGRID_WEBHOOK_SECRET is not set. Skipping webhook signature verification.');
        return next();
    }

    const signature = req.headers['x-twilio-email-event-webhook-signature'];
    const timestamp = req.headers['x-twilio-email-event-webhook-timestamp'];
    // req.rawBody is captured by the middleware added in server.js
    const payload = req.rawBody; 

    // --- ADDED DEBUG LOGS HERE ---
    logger.log(`[DEBUG - Webhook Verify] Signature Header: "${signature}" (type: ${typeof signature})`);
    logger.log(`[DEBUG - Webhook Verify] Timestamp Header: "${timestamp}" (type: ${typeof timestamp})`);
    logger.log(`[DEBUG - Webhook Verify] Raw Body Content (first 100 chars): "${payload ? payload.substring(0, Math.min(payload.length, 100)) : 'N/A'}" (type: ${typeof payload}, length: ${payload ? payload.length : 'N/A'})`);
    // --- END DEBUG LOGS ---

    if (!signature || !timestamp || !payload) {
        logger.error('[Webhook Verification] Missing signature, timestamp, or raw body. Rejecting webhook.');
        // If rawBody is missing, it implies the server.js middleware didn't run or failed.
        return res.status(401).send('Unauthorized: Missing required webhook data');
    }

    try {
        const eb = new EventWebhook(SENDGRID_WEBHOOK_SECRET);
        
        const isVerified = eb.verifySignature(
            {
                signature: signature,
                timestamp: timestamp,
                payload: payload // Use the raw body here
            }
        );

        if (isVerified) {
            logger.log('[Webhook Verification] Signature verified successfully.');
            next();
        } else {
            logger.error('[Webhook Verification] Invalid signature. Rejecting webhook.');
            res.status(401).send('Unauthorized: Invalid signature');
        }
    } catch (error) {
        logger.error('[Webhook Verification Error]', error);
        res.status(500).send('Internal Server Error during webhook verification');
    }
};
// --- END NEW WEBHOOK VERIFICATION MIDDLEWARE ---

exports.handleWebhook = async (req, res) => {
    logger.log('[Webhook] Received SendGrid events:', req.body.length, 'events');

    for (const event of req.body) {
        logger.log(`[Webhook] Processing event: ${event.event} for ${event.email}, Campaign ID: ${event.campaignId}, Subscriber ID: ${event.subscriberId}, List ID: ${event.listId}`);

        const { campaignId, subscriberId, listId } = event.custom_args || {};

        if (!campaignId || !subscriberId || !listId) {
            logger.warn(`[Webhook] Missing custom_args for event type ${event.event}. Campaign ID: ${campaignId}, Subscriber ID: ${subscriberId}, List ID: ${listId}. Skipping processing for this event.`);
            continue;
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
                    break;
                case 'dropped':
                    logger.log(`[Webhook] Email dropped for ${event.email}, Reason: ${event.reason}`);
                    break;
                case 'spamreport':
                    logger.log(`[Webhook] Spam report from ${event.email}`);
                    await Campaign.findByIdAndUpdate(campaignId, { $inc: { complaintCount: 1 } });
                    break;
                case 'unsubscribe':
                    logger.log(`[Webhook] Email unsubscribed by ${event.email}`);
                    await Campaign.findByIdAndUpdate(campaignId, { $inc: { unsubscribedCount: 1 } });
                    await Subscriber.findByIdAndUpdate(subscriberId, { status: 'unsubscribed' });
                    break;
                case 'delivered':
                    logger.log(`[Webhook] Email delivered to ${event.email}`);
                    break;
                case 'processed':
                    logger.log(`[Webhook] Email processed by SendGrid for ${event.email}`);
                    break;
                default:
                    logger.log(`[Webhook] Unhandled event type: ${event.event} for ${event.email}`);
            }

        } catch (error) {
            logger.error(`[Webhook Error] Failed to process event for ${event.email}, type ${event.event}:`, error);
        }
    }
    res.status(200).send('Webhook received and processed');
};


exports.unsubscribe = async (req, res) => {
    const { subscriberId } = req.params;
    const { campaignId } = req.query;

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

        if (campaignId) {
            await Campaign.findByIdAndUpdate(campaignId, { $inc: { unsubscribedCount: 1 } });
            logger.log(`[Unsubscribe] Campaign ${campaignId} unsubscribed count incremented.`);
        }

        res.status(200).send('You have successfully unsubscribed.');
    } catch (error) {
        logger.error(`[Unsubscribe Error] Failed to unsubscribe subscriber ${subscriberId}:`, error);
        res.status(500).send('An error occurred during unsubscribe.');
    }
};
// emailxp/backend/controllers/trackingController.js

const Campaign = require('../models/Campaign');
const Subscriber = require('../models/Subscriber'); // Make sure Subscriber model is imported
const logger = require('../utils/logger'); // Assuming you have a logger

// --- NEW IMPORTS FOR WEBHOOK VERIFICATION ---
const { EventWebhook, Request } = require('@sendgrid/eventwebhook');
const crypto = require('crypto'); // Node.js built-in module
// --- END NEW IMPORTS ---

// --- NEW: Get SendGrid Webhook Secret from environment variables ---
// IMPORTANT: Ensure this variable (SENDGRID_WEBHOOK_SECRET) is set in your Railway environment
const SENDGRID_WEBHOOK_SECRET = process.env.SENDGRID_WEBHOOK_SECRET;

// --- NEW: Webhook Verification Middleware ---
const verifyWebhookSignature = (req, res, next) => {
    // If no secret, skip verification (NOT RECOMMENDED IN PROD IF SIGNED EVENTS IS ON)
    if (!SENDGRID_WEBHOOK_SECRET) {
        logger.warn('[Webhook] SENDGRID_WEBHOOK_SECRET is not set. Skipping webhook signature verification.');
        return next();
    }

    const signature = req.headers['x-twilio-email-event-webhook-signature'];
    const timestamp = req.headers['x-twilio-email-event-webhook-timestamp'];
    const payload = req.body; // Express's express.json() parses this before it gets here

    if (!signature || !timestamp) {
        logger.error('[Webhook Verification] Missing signature or timestamp headers. Rejecting webhook.');
        return res.status(401).send('Unauthorized: Missing signature or timestamp');
    }

    try {
        // Construct the signed payload string exactly as SendGrid does
        // This requires the raw body, not the parsed JSON body
        // We'll need to modify server.js slightly to get the raw body.
        
        // For now, let's assume express.json() doesn't interfere too much,
        // but the most robust way is to get the raw body.
        // Let's use the EventWebhook library's verify method.
        
        const eb = new EventWebhook(SENDGRID_WEBHOOK_SECRET);
        
        // The EventWebhook.verifySignature method expects a raw body.
        // Since express.json() has already parsed req.body, we need to ensure
        // our server.js captures the raw body.
        // Temporarily, we'll try to verify with the parsed body, but
        // this might be the source of issues if the signature doesn't match.
        // See the server.js modification below!
        
        const isVerified = eb.verifySignature(
            {
                signature: signature,
                timestamp: timestamp,
                payload: req.rawBody // We'll add this to req in server.js
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
    // Now that verification is done, process the events
    // req.body is already parsed by express.json()
    logger.log('[Webhook] Received SendGrid events:', req.body.length, 'events');

    for (const event of req.body) {
        logger.log(`[Webhook] Processing event: ${event.event} for ${event.email}, Campaign ID: ${event.campaignId}, Subscriber ID: ${event.subscriberId}, List ID: ${event.listId}`);

        // Note: event.custom_args should now be present if verification passed and they were sent!
        // We'll still keep the check just in case, but it should now work.
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
                case 'dropped': // SendGrid drops emails for various reasons (e.g., unsubscribed, invalid email)
                    logger.log(`[Webhook] Email dropped for ${event.email}, Reason: ${event.reason}`);
                    // You might want to handle this as a soft bounce or similar
                    // await Campaign.findByIdAndUpdate(campaignId, { $inc: { droppedCount: 1 } }); // If you add this field
                    break;
                case 'spamreport':
                    logger.log(`[Webhook] Spam report from ${event.email}`);
                    await Campaign.findByIdAndUpdate(campaignId, { $inc: { complaintCount: 1 } });
                    // Optionally, unsubscribe the user automatically
                    // await Subscriber.findByIdAndUpdate(subscriberId, { status: 'unsubscribed' });
                    break;
                case 'unsubscribe':
                    logger.log(`[Webhook] Email unsubscribed by ${event.email}`);
                    await Campaign.findByIdAndUpdate(campaignId, { $inc: { unsubscribedCount: 1 } });
                    await Subscriber.findByIdAndUpdate(subscriberId, { status: 'unsubscribed' });
                    break;
                case 'delivered':
                    logger.log(`[Webhook] Email delivered to ${event.email}`);
                    // Optionally update a 'delivered' count if needed, but 'emailsSuccessfullySent' might cover this.
                    // await Campaign.findByIdAndUpdate(campaignId, { $inc: { deliveredCount: 1 } });
                    break;
                case 'processed':
                    logger.log(`[Webhook] Email processed by SendGrid for ${event.email}`);
                    // No specific action usually needed here unless you want to track pre-delivery metrics.
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


// Your custom unsubscribe function (GET route)
exports.unsubscribe = async (req, res) => {
    // This function remains largely the same, but I've included it for completeness.
    // Ensure it correctly updates the subscriber status.
    const { subscriberId } = req.params;
    const { campaignId } = req.query; // Assuming campaignId might be passed as a query param from the unsubscribe link

    logger.log(`[Unsubscribe] Attempting to unsubscribe subscriber ID: ${subscriberId} from campaign ID: ${campaignId || 'N/A'}`);

    try {
        const subscriber = await Subscriber.findById(subscriberId);

        if (!subscriber) {
            logger.warn(`[Unsubscribe] Subscriber with ID ${subscriberId} not found.`);
            return res.status(404).send('Subscriber not found.');
        }

        // Check if subscriber is already unsubscribed for this list
        // You might need to adjust your Subscriber model to track unsubs per list if needed.
        if (subscriber.status === 'unsubscribed') {
            logger.log(`[Unsubscribe] Subscriber ${subscriberId} is already unsubscribed.`);
            return res.status(200).send('You have already unsubscribed from this list.');
        }

        // Update subscriber status
        subscriber.status = 'unsubscribed';
        await subscriber.save();
        logger.log(`[Unsubscribe] Subscriber ${subscriberId} successfully unsubscribed.`);

        // Optionally, update campaign unsubscribed count immediately (webhook might do this too)
        if (campaignId) {
            await Campaign.findByIdAndUpdate(campaignId, { $inc: { unsubscribedCount: 1 } });
            logger.log(`[Unsubscribe] Campaign ${campaignId} unsubscribed count incremented.`);
        }

        // Render a simple confirmation page or redirect
        res.status(200).send('You have successfully unsubscribed.'); // Or send an HTML confirmation
    } catch (error) {
        logger.error(`[Unsubscribe Error] Failed to unsubscribe subscriber ${subscriberId}:`, error);
        res.status(500).send('An error occurred during unsubscribe.');
    }
};
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

    if (!SENDGRID_WEBHOOK_SECRET) {
        logger.warn('[Webhook] No webhook secret configured — skipping verification');
        return next();
    }

    if (!signature || !timestamp || !payload) {
        logger.error('[Webhook Verification] Missing required signature headers or body');
        return res.status(401).send('Unauthorized: Missing required data');
    }

    try {
        const webhook = new EventWebhook(SENDGRID_WEBHOOK_SECRET);
        const isVerified = webhook.verifySignature({
            payload,
            signature,
            timestamp
        });

        if (isVerified) {
            logger.log('[Webhook Verification] Signature verified successfully');
            next();
        } else {
            logger.error('[Webhook Verification] Signature invalid');
            res.status(401).send('Unauthorized: Invalid signature');
        }
    } catch (err) {
        logger.error('[Webhook Verification Error]', err);
        res.status(200).send('Webhook received with internal verification error');
    }
};

/**
 * @desc Handle SendGrid Webhook events (processed, delivered, open, click, bounce, etc.)
 */
exports.handleWebhook = async (req, res) => {
    logger.log('[Webhook] Received SendGrid events:', req.body.length, 'events');

    for (const event of req.body) {
        logger.log(`[Webhook] Processing event: ${event.event} for ${event.email}, Campaign ID: ${event.campaignId}, Subscriber ID: ${event.subscriberId}, List ID: ${event.listId}`);

        const { campaignId, subscriberId, listId } = event.custom_args || {};

        if (!campaignId || !subscriberId || !listId) {
            logger.warn(`[Webhook] Missing custom_args for event type ${event.event}. Skipping.`);
            continue;
        }

        try {
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

            switch (event.event) {
                case 'open':
                    logger.log(`[Webhook] Email opened by ${event.email}`);
                    await Campaign.findByIdAndUpdate(campaignId, { $inc: { opens: 1 } });
                    break;
                case 'click':
                    logger.log(`[Webhook] Link clicked by ${event.email}, URL: ${event.url}`);
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
                    await Subscriber.findByIdAndUpdate(subscriberId, { status: 'unsubscribed' });
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
                    logger.log(`[Webhook] Unhandled event type: ${event.event}`);
            }

        } catch (error) {
            logger.error(`[Webhook Error] Failed to process event for ${event.email}, type ${event.event}:`, error);
        }
    }

    res.status(200).send('Webhook received and processed');
};

/**
 * @desc Handle unsubscribe link clicks
 */
exports.unsubscribe = async (req, res) => {
    const { subscriberId } = req.params;
    const { campaignId } = req.query;

    logger.log(`[Unsubscribe] Attempting to unsubscribe subscriber ID: ${subscriberId} from campaign ID: ${campaignId || 'N/A'}`);

    try {
        const subscriber = await Subscriber.findById(subscriberId);

        if (!subscriber) {
            logger.warn(`[Unsubscribe] Subscriber with ID ${subscriberId} not found`);
            return res.status(404).send('Subscriber not found');
        }

        if (subscriber.status === 'unsubscribed') {
            logger.log(`[Unsubscribe] Subscriber ${subscriberId} already unsubscribed`);
            return res.status(200).send('You have already unsubscribed');
        }

        subscriber.status = 'unsubscribed';
        await subscriber.save();
        logger.log(`[Unsubscribe] Subscriber ${subscriberId} successfully unsubscribed`);

        if (campaignId) {
            await Campaign.findByIdAndUpdate(campaignId, { $inc: { unsubscribedCount: 1 } });
            logger.log(`[Unsubscribe] Campaign ${campaignId} unsubscribed count incremented`);
        }

        res.status(200).send('You have successfully unsubscribed');
    } catch (error) {
        logger.error(`[Unsubscribe Error] Failed to unsubscribe subscriber ${subscriberId}:`, error);
        res.status(500).send('An error occurred during unsubscribe');
    }
};

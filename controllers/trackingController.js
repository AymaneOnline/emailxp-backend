// emailxp/backend/controllers/trackingController.js

const Subscriber = require('../models/Subscriber');
const Campaign = require('../models/Campaign'); // Assuming you might update campaign stats

// Basic logger (copied from campaignScheduler.js for consistency, or use a centralized one)
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const logger = {
    log: (...args) => { if (!IS_PRODUCTION) { console.log(...args); } },
    warn: (...args) => { console.warn(...args); },
    error: (...args) => { console.error(...args); }
};

/**
 * @desc Handle SendGrid Webhook events (processed, delivered, open, click, bounce, etc.)
 * This endpoint receives event data from SendGrid.
 * It's crucial to set up this URL in your SendGrid account under Settings > Mail Settings > Event Webhook.
 * DO NOT send a 200 OK response until you have successfully processed the event, or SendGrid will retry.
 */
exports.handleWebhook = async (req, res) => {
    logger.log('[Webhook] Received SendGrid events:', req.body.length, 'events');

    // SendGrid sends an array of events
    for (const event of req.body) {
        logger.log(`[Webhook] Processing event: ${event.event} for ${event.email}, Campaign ID: ${event.campaignId}, Subscriber ID: ${event.subscriberId}, List ID: ${event.listId}`);

        // Extract custom arguments
        const { campaignId, subscriberId, listId } = event.custom_args || {}; // Access custom_args here!

        // Basic validation for required IDs from custom_args
        if (!campaignId || !subscriberId || !listId) {
            logger.warn(`[Webhook] Missing custom_args for event type ${event.event}. Campaign ID: ${campaignId}, Subscriber ID: ${subscriberId}, List ID: ${listId}. Skipping processing for this event.`);
            // Continue to the next event, but don't fail the whole request
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
                case 'processed':
                    // Email successfully queued by SendGrid
                    logger.log(`[Webhook] Email processed for ${event.email}`);
                    // You might want to update a 'processed' count on the campaign if needed
                    break;
                case 'delivered':
                    // Email successfully delivered to recipient's server
                    logger.log(`[Webhook] Email delivered to ${event.email}`);
                    // You might update a delivery status or count
                    break;
                case 'open':
                    // Recipient opened the email (pixel fired)
                    logger.log(`[Webhook] Email opened by ${event.email}`);
                    // Increment open count for campaign
                    await Campaign.findByIdAndUpdate(campaignId, { $inc: { opens: 1 } });
                    // Mark email as opened for this subscriber/campaign instance (if you track per email)
                    break;
                case 'click':
                    // Recipient clicked a link in the email
                    logger.log(`[Webhook] Link clicked by ${event.email} for URL: ${event.url}`);
                    // Increment click count for campaign
                    await Campaign.findByIdAndUpdate(campaignId, { $inc: { clicks: 1 } });
                    // You might also track which specific URL was clicked
                    break;
                case 'bounce':
                    // Email bounced (soft or hard)
                    logger.log(`[Webhook] Email bounced for ${event.email}. Reason: ${event.reason}, Status: ${event.status}`);
                    // Update subscriber status to 'bounced' or 'unsubscribed' depending on bounce type
                    if (event.type === 'hardbounce') {
                        await Subscriber.findByIdAndUpdate(subscriberId, { status: 'bounced' });
                    }
                    // You might update a bounce count on the campaign
                    break;
                case 'unsubscribe':
                    // Recipient clicked an unsubscribe link (from SendGrid's automatically added links if enabled)
                    logger.log(`[Webhook] Subscriber ${event.email} unsubscribed via SendGrid webhook.`);
                    await Subscriber.findByIdAndUpdate(subscriberId, { status: 'unsubscribed' });
                    break;
                case 'spamreport':
                    // Recipient marked email as spam
                    logger.log(`[Webhook] Subscriber ${event.email} reported spam.`);
                    await Subscriber.findByIdAndUpdate(subscriberId, { status: 'unsubscribed' }); // Mark as unsubscribed or spam
                    break;
                // Add more cases for other event types (deferred, dropped etc.) as needed
                default:
                    logger.log(`[Webhook] Unhandled event type: ${event.event} for ${event.email}`);
                    break;
            }

        } catch (error) {
            logger.error(`[Webhook Error] Failed to process event for ${event.email}, type ${event.event}:`, error);
            // Don't send 500 here, as SendGrid will retry the entire batch.
            // Just log and continue.
        }
    }

    // Always send a 200 OK after processing all events to tell SendGrid not to retry.
    res.status(200).send('Webhook received and processed');
};

/**
 * @desc Handle direct unsubscribe link clicks.
 * This is for your custom unsubscribe link that you inject into the email content.
 * Your SendGrid webhook will also catch unsubscribe events if SendGrid automatically adds unsubscribe links.
 */
exports.unsubscribe = async (req, res) => {
    const { subscriberId } = req.params;
    const { campaignId } = req.query; // If you want to track which campaign they unsubscribed from

    try {
        const subscriber = await Subscriber.findById(subscriberId);

        if (!subscriber) {
            logger.warn(`[Unsubscribe] Subscriber with ID ${subscriberId} not found.`);
            return res.status(404).send('Subscriber not found.');
        }

        if (subscriber.status === 'unsubscribed') {
            logger.log(`[Unsubscribe] Subscriber ${subscriber.email} is already unsubscribed.`);
            return res.status(200).send('You have already unsubscribed.');
        }

        subscriber.status = 'unsubscribed';
        await subscriber.save();

        // Optionally, increment an unsubscribe count on the campaign
        if (campaignId) {
            await Campaign.findByIdAndUpdate(campaignId, { $inc: { unsubscribes: 1 } });
        }

        logger.log(`[Unsubscribe] Subscriber ${subscriber.email} (ID: ${subscriberId}) unsubscribed.`);
        res.status(200).send('You have successfully unsubscribed.'); // Or redirect to a success page
    } catch (error) {
        logger.error(`[Unsubscribe Error] Failed to unsubscribe subscriber ${subscriberId}:`, error);
        res.status(500).send('An error occurred during unsubscribe.');
    }
};
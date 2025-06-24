// emailxp/backend/controllers/trackingController.js

const Campaign = require('../models/Campaign');
const Subscriber = require('../models/Subscriber');
const logger = require('../utils/logger');
// const crypto = require('crypto'); // No longer needed for manual tracking

// Removed SENDGRID_WEBHOOK_PUBLIC_KEY_DER_BASE64 and sendGridPublicKeyObject

/**
 * @desc Handles email open tracking.
 * Called by a 1x1 tracking pixel embedded in the email.
 */
exports.trackOpen = async (req, res) => {
    const { campaignId, subscriberId } = req.query; // IDs are now directly in query params

    logger.log(`[Tracking] Open event received - Campaign ID: ${campaignId}, Subscriber ID: ${subscriberId}`);

    try {
        // Validate IDs
        if (!campaignId || !subscriberId || !isValidObjectId(campaignId) || !isValidObjectId(subscriberId)) {
            logger.warn(`[Tracking] Invalid or missing IDs for open tracking. Campaign: ${campaignId}, Subscriber: ${subscriberId}`);
            // Still respond with a 200 OK and a transparent GIF to prevent issues in email clients
            return res.status(200).send(Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64'));
        }

        const campaign = await Campaign.findById(campaignId);
        const subscriber = await Subscriber.findById(subscriberId);

        if (!campaign) {
            logger.warn(`[Tracking] Campaign ${campaignId} not found for open tracking.`);
        }
        if (!subscriber) {
            logger.warn(`[Tracking] Subscriber ${subscriberId} not found for open tracking.`);
        }

        if (campaign) {
            await Campaign.findByIdAndUpdate(
                campaignId, 
                { 
                    $inc: { opens: 1 },
                    $set: { lastActivity: new Date() }
                }
            );
            logger.log(`[Tracking] Campaign ${campaignId} open count incremented.`);
        }

        // Send back a 1x1 transparent GIF
        res.setHeader('Content-Type', 'image/gif');
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        res.status(200).send(Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64'));
        logger.log(`[Tracking] Sent 1x1 GIF for open event.`);

    } catch (error) {
        logger.error(`[Tracking Error] Failed to track open for Campaign ${campaignId}, Subscriber ${subscriberId}:`, error);
        // Even on error, send a 200 and a GIF to avoid email client issues
        res.setHeader('Content-Type', 'image/gif');
        res.status(200).send(Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64'));
    }
};

/**
 * @desc Handles email click tracking and redirects to the original URL.
 * Called by modified links in the email.
 */
exports.trackClick = async (req, res) => {
    const { campaignId, subscriberId, redirect } = req.query;

    logger.log(`[Tracking] Click event received - Campaign ID: ${campaignId}, Subscriber ID: ${subscriberId}, Redirect URL: ${decodeURIComponent(redirect || 'N/A')}`);

    try {
        // Validate IDs
        if (!campaignId || !subscriberId || !isValidObjectId(campaignId) || !isValidObjectId(subscriberId)) {
            logger.warn(`[Tracking] Invalid or missing IDs for click tracking. Campaign: ${campaignId}, Subscriber: ${subscriberId}`);
            // Attempt to redirect anyway if a redirect URL is provided, but don't track.
            if (redirect) {
                return res.redirect(decodeURIComponent(redirect));
            }
            return res.status(400).json({ error: 'Invalid or missing tracking IDs' });
        }

        const campaign = await Campaign.findById(campaignId);
        const subscriber = await Subscriber.findById(subscriberId);

        if (!campaign) {
            logger.warn(`[Tracking] Campaign ${campaignId} not found for click tracking.`);
        }
        if (!subscriber) {
            logger.warn(`[Tracking] Subscriber ${subscriberId} not found for click tracking.`);
        }

        if (campaign) {
            await Campaign.findByIdAndUpdate(
                campaignId, 
                { 
                    $inc: { clicks: 1 },
                    $set: { lastActivity: new Date() }
                }
            );
            logger.log(`[Tracking] Campaign ${campaignId} click count incremented.`);
        }

        // Redirect to the original URL
        if (redirect) {
            logger.log(`[Tracking] Redirecting to: ${decodeURIComponent(redirect)}`);
            return res.redirect(decodeURIComponent(redirect));
        } else {
            logger.warn('[Tracking] No redirect URL provided for click tracking.');
            return res.status(200).json({ message: 'Click tracked, but no redirect URL provided.' });
        }

    } catch (error) {
        logger.error(`[Tracking Error] Failed to track click for Campaign ${campaignId}, Subscriber ${subscriberId}:`, error);
        if (redirect) {
            return res.redirect(decodeURIComponent(redirect)); // Still attempt to redirect on error
        }
        res.status(500).json({ error: 'An error occurred during click tracking' });
    }
};

/**
 * @desc Handles unsubscribe link clicks (original functionality remains)
 */
exports.unsubscribe = async (req, res) => {
    const { subscriberId } = req.params;
    const { campaignId } = req.query; // campaignId would be from the URL params now

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

/**
 * @desc Validate if a string is a valid MongoDB ObjectId
 */
function isValidObjectId(id) {
    if (!id || typeof id !== 'string') return false;
    return /^[0-9a-fA-F]{24}$/.test(id);
}
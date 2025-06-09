const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose'); // Import mongoose to use ObjectId validation
const OpenEvent = require('../models/OpenEvent');
// No need to import Campaign or Subscriber models here for basic tracking,
// as we're just recording the IDs. We assume they exist.

// A 1x1 transparent GIF image, base64 encoded.
// This is what we will send as a response to the tracking pixel request.
const transparentGif = Buffer.from(
    'R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==',
    'base64'
);

// @desc    Track email open
// @route   GET /api/track/open/:campaignId/:subscriberId
// @access  Public (This route is hit by email clients, so it must be public)
const trackOpen = asyncHandler(async (req, res) => {
    const { campaignId, subscriberId } = req.params;

    // --- IMPORTANT: Send the transparent GIF response immediately ---
    // This ensures the email client loads the image quickly without waiting for DB operations.
    res.set('Content-Type', 'image/gif');
    res.send(transparentGif);

    // --- Log the open event asynchronously after sending the response ---
    // The database operation happens in the background, not delaying the image serving.
    try {
        // Basic validation for MongoDB ObjectIDs
        if (!mongoose.Types.ObjectId.isValid(campaignId) || !mongoose.Types.ObjectId.isValid(subscriberId)) {
            console.error(`Tracking Error: Invalid Campaign ID (${campaignId}) or Subscriber ID (${subscriberId}) provided for open tracking.`);
            return; // Stop processing if IDs are invalid
        }

        // Create the open event record in the database
        await OpenEvent.create({
            campaign: campaignId,
            subscriber: subscriberId,
            // You can optionally capture more data like IP address and User-Agent:
            // ipAddress: req.ip, // Requires your Express app to trust proxies if running behind one
            // userAgent: req.headers['user-agent'],
        });

        console.log(`Email Open Tracked: Campaign ID ${campaignId}, Subscriber ID ${subscriberId}`);

    } catch (error) {
        console.error(`Error saving open event for Campaign ${campaignId}, Subscriber ${subscriberId}:`, error);
        // Do NOT send another response (like res.status().json()) here,
        // as res.send(transparentGif) has already sent the response header.
    }
});

module.exports = {
    trackOpen,
};